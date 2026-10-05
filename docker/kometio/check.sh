#!/usr/bin/env bash
#
# Starts a Kometio image the way docker/kometio/README.md says, proves that it
# works, and runs the end-to-end suite against it.
#
#   docker/kometio/check.sh IMAGE                run everything
#   docker/kometio/check.sh IMAGE --smoke-only   skip the browser suite
#
# CI runs this on every pull request (against an image built from the
# branch) and, with --smoke-only, on the image it is about to publish. You can
# run it the same way on your machine: it needs Docker, curl, node and openssl,
# and, for the full run, `pnpm install` done and Playwright's Chromium.
#
# It uses names and ports of its own (`kometio-check*`, 15200/15000/15322, the
# server with a name on 18080/18443, and Mailpit on 11025/18025), so it can run
# next to your development stack, and it
# refuses to start if one of those names is taken: what it removes at the end
# is only what it created.
set -euo pipefail

IMAGE="${1:?usage: docker/kometio/check.sh IMAGE [--smoke-only]}"
SMOKE_ONLY=false
[ "${2:-}" = "--smoke-only" ] && SMOKE_ONLY=true

NAME=kometio-check
MAILPIT=kometio-check-mailpit
VOLUME=kometio-check-data
# The second installation, for the first run in a browser (full run only).
FIRST=kometio-check-first
FIRST_VOLUME=kometio-check-first-data
FIRST_EDITOR_PORT=16200
FIRST_API_PORT=16000
FIRST_SITE_PORT=16322
# The third, a server with a name (DOMAIN, docs/adr/0104): HTTPS through Caddy
# with its own certificate authority, since no public one can issue for a name
# that only this machine knows. `*.localhost` is the machine itself, to a browser
# and to this machine's resolver, so no DNS is needed.
HTTPS=kometio-check-https
HTTPS_VOLUME=kometio-check-https-data
HTTPS_DOMAIN=kometio-check.localhost
HTTPS_HTTP_PORT=18080
HTTPS_PORT=18443
# The fourth, the first one's site moved: exported while it runs, opened into a
# volume that has never been used, and started under another address (docs/adr/0105).
MOVED=kometio-check-moved
MOVED_VOLUME=kometio-check-moved-data
MOVED_EDITOR_PORT=19200
MOVED_API_PORT=19000
MOVED_SITE_PORT=19322
EDITOR_PORT=15200
API_PORT=15000
SITE_PORT=15322
SMTP_PORT=11025
MAILPIT_PORT=18025
EDITOR_URL="http://localhost:${EDITOR_PORT}"
API_URL="http://localhost:${API_PORT}/api"
SITE_URL="http://localhost:${SITE_PORT}"
# Cloudflare's published test keys, which accept every captcha. Only the main
# installation is given them: the end-to-end suite logs in through the API with a
# placeholder token, and its form test waits for Turnstile's field, so both need
# a captcha that passes. The first-run installation is given none, as the
# quickstart has it, and its login and its public form go through the captcha
# built into Kometio (docs/adr/0103).
TURNSTILE_TEST_SITE_KEY=1x00000000000000000000AA
TURNSTILE_TEST_SECRET_KEY=1x0000000000000000000000000000000AA

ADMIN_EMAIL="check-admin@example.test"
# Invited in the first-run test, on an installation with no mail server.
INVITEE_EMAIL="check-invitee@example.test"
ADMIN_PASSWORD="$(openssl rand -hex 16)"

failed=0
step() { printf '\n== %s\n' "$1"; }
pass() { printf '   ok    %s\n' "$1"; }
fail() { printf '   FAIL  %s\n' "$1"; failed=1; }

# Runs a command and reports it; one failure does not hide the ones after it.
check() {
  local what="$1"
  shift
  if "$@" >/dev/null 2>&1; then pass "$what"; else fail "$what"; fi
}

cleanup() {
  local status=$?
  if [ "$status" -ne 0 ] || [ "$failed" -ne 0 ]; then
    printf '\n== the last lines of the image log\n'
    docker logs --tail 40 "$NAME" 2>&1 || true
    for other in "$FIRST" "$HTTPS" "$MOVED"; do
      if docker ps -a --format '{{.Names}}' | grep -qx "$other"; then
        printf '\n== the last lines of the log of %s\n' "$other"
        docker logs --tail 40 "$other" 2>&1 || true
      fi
    done
  fi
  docker rm -fv "$NAME" "$MAILPIT" "$FIRST" "$HTTPS" "$MOVED" >/dev/null 2>&1 || true
  # Only the volumes this script made: the checks below guarantee they did not exist.
  docker volume rm "$VOLUME" "$FIRST_VOLUME" "$HTTPS_VOLUME" "$MOVED_VOLUME" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}

# --- before anything is started -------------------------------------------------
#
# These come BEFORE the trap that cleans up: stopping here because a name is
# taken must not remove the thing that holds it.

for taken in "$NAME" "$MAILPIT" "$FIRST" "$HTTPS" "$MOVED"; do
  if docker ps -a --format '{{.Names}}' | grep -qx "$taken"; then
    echo "A container named $taken already exists: remove it first (this script removes what it creates, and would remove that too)." >&2
    exit 2
  fi
done
for taken in "$VOLUME" "$FIRST_VOLUME" "$HTTPS_VOLUME" "$MOVED_VOLUME"; do
  if docker volume ls -q | grep -qx "$taken"; then
    echo "A volume named $taken already exists: remove it first." >&2
    exit 2
  fi
done

WORK="$(mktemp -d)"
COOKIES="${WORK}/cookies.txt"
trap cleanup EXIT

# Each helper takes the container as an optional last argument: the main one by default.
banners() { docker logs "${1:-$NAME}" 2>&1 | grep -c 'Kometio is ready' || true; }

wait_for_banners() {
  local wanted="$1" container="${2:-$NAME}" started
  started=$(date +%s)
  until [ "$(banners "$container")" -ge "$wanted" ]; do
    if [ "$(docker inspect -f '{{.State.Status}}' "$container")" != "running" ]; then
      echo "The container stopped before it was ready." >&2
      return 1
    fi
    if [ $(($(date +%s) - started)) -gt 150 ]; then
      echo "No 'Kometio is ready' after 150 seconds." >&2
      return 1
    fi
    sleep 0.5
  done
  echo $(($(date +%s) - started))
}

# The one thing a person does first: read the setup token from the log.
setup_token() {
  docker logs "${1:-$NAME}" 2>&1 | grep -E '^\s+[A-Za-z0-9_-]{43}\s*$' | tail -1 | tr -d ' \r'
}

status_code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# --- the part of the launcher that is only logic ---------------------------------
#
# What DOMAIN may be and the addresses it makes (docs/adr/0104), and when an
# archive is trusted (docs/adr/0105): no container needed, so it is asked first.
step "the launcher's own logic"
check "DOMAIN is read as documented, and a mistake in it says what to write" \
  node --test "$(git rev-parse --show-toplevel)/docker/kometio/server-mode.test.mjs"
check "an archive is trusted as documented: its manifest, its migrations, what it may hold" \
  node --test "$(git rev-parse --show-toplevel)/docker/kometio/archive.test.mjs"
check "the launcher's control socket answers as documented: one archive at a time, a refusal before it starts, a cut when it fails on its way" \
  node --test "$(git rev-parse --show-toplevel)/docker/kometio/control-server.test.mjs"

# --- the first run, in a browser ------------------------------------------------
#
# On an installation of its own, started the way the quickstart says: no captcha
# key, no mail server, and an address only because this machine's default ports
# may be taken. The main installation below is given a captcha key and a mail
# server so that the rest of the suite can use them, and that hides what a person
# meets first (docs/adr/0101): a login button that stayed disabled for lack of a
# key, a login left on the host by another installation, a site "not found".
#
# It runs twice, on two installations that differ only in how they are reached:
# on plain ports, and on a server with a name over HTTPS (below).

# Starts $1 on the volume $2, walks the first run in a browser against the three
# addresses that follow ($3 editor, $4 API, $5 site), and checks its log. The
# docker arguments after them say how it is published and reached. It leaves the
# container running: whoever called it has more to ask of it.
first_run() {
  local container="$1" volume="$2" editor_url="$3" api_url="$4" site_url="$5" log
  shift 5
  docker run -d --name "$container" "$@" -v "${volume}:/data" "$IMAGE" >/dev/null
  wait_for_banners 1 "$container" >/dev/null
  if (
    cd "$(git rev-parse --show-toplevel)"
    E2E_SETUP_TOKEN="$(setup_token "$container")" \
      VITE_API_URL="$api_url" EDITOR_APP_URL="$editor_url" VITE_PUBLIC_SITE_URL="$site_url" \
      DEFAULT_USER_EMAIL="$ADMIN_EMAIL" DEFAULT_USER_PASSWORD="$ADMIN_PASSWORD" \
      E2E_INVITEE_EMAIL="$INVITEE_EMAIL" \
      pnpm exec nx run @kometio/e2e:first-run
  ); then
    pass "a person who starts the image reaches a working site, and can sign in again"
  else
    fail "the first run in a browser failed"
  fi
  # No mail server: the invitation the test made is in the log, link included
  # (docs/adr/0103). Without this a quiet log would pass for a working mailer.
  log="$(docker logs "$container" 2>&1 || true)"
  check "an invitation with no mail server is written to the log" \
    grep -q "To:      ${INVITEE_EMAIL}" <<<"$log"
  check "the logged invitation carries its link" \
    grep -q "${editor_url}/accept-invite?inviteToken=" <<<"$log"
  check "a password reset with no mail server is written to the log, link included" \
    grep -q "${editor_url}/reset-password?resetToken=" <<<"$log"
  # With no Turnstile keys the captcha is the built-in one, and it hands out a
  # signed challenge to anyone who asks (the login of the test above solved one).
  check "with no Turnstile keys the API hands out a challenge of its own" \
    sh -c "curl -skf '${api_url}/captcha/challenge' | grep -q '\"signature\"'"
}

if [ "$SMOKE_ONLY" = false ]; then
  step "the first run, in a browser, as the image is delivered"
  FIRST_EDITOR_URL="http://localhost:${FIRST_EDITOR_PORT}"
  FIRST_API_URL="http://localhost:${FIRST_API_PORT}/api"
  FIRST_SITE_URL="http://localhost:${FIRST_SITE_PORT}"
  first_run "$FIRST" "$FIRST_VOLUME" "$FIRST_EDITOR_URL" "$FIRST_API_URL" "$FIRST_SITE_URL" \
    -p "${FIRST_EDITOR_PORT}:80" -p "${FIRST_API_PORT}:3000" -p "${FIRST_SITE_PORT}:4322" \
    -e "EDITOR_APP_URL=${FIRST_EDITOR_URL}" \
    -e "API_PUBLIC_URL=${FIRST_API_URL}" \
    -e "PUBLIC_SITE_URL=${FIRST_SITE_URL}"
  docker rm -fv "$FIRST" >/dev/null
  docker volume rm "$FIRST_VOLUME" >/dev/null 2>&1 || true

  # --- a server with a name, over HTTPS -----------------------------------------
  #
  # DOMAIN is all a server is told (docs/adr/0104): Caddy takes ports 80 and 443,
  # the editor is at admin. and the API at api. The three addresses are written
  # out here only because the ports are not 80 and 443, which a machine running
  # this may need for itself; the names are the ones DOMAIN would have given.
  step "a server with a name, over HTTPS (Caddy's own certificate authority)"
  if ! node -e "require('dns').lookup('admin.${HTTPS_DOMAIN}', (error) => process.exit(error ? 1 : 0))"; then
    echo "This machine does not resolve admin.${HTTPS_DOMAIN}: *.localhost has to mean this machine (RFC 6761); add the three names to /etc/hosts." >&2
    exit 2
  fi
  HTTPS_EDITOR_URL="https://admin.${HTTPS_DOMAIN}:${HTTPS_PORT}"
  HTTPS_API_URL="https://api.${HTTPS_DOMAIN}:${HTTPS_PORT}/api"
  HTTPS_SITE_URL="https://${HTTPS_DOMAIN}:${HTTPS_PORT}"
  first_run "$HTTPS" "$HTTPS_VOLUME" "$HTTPS_EDITOR_URL" "$HTTPS_API_URL" "$HTTPS_SITE_URL" \
    -p "${HTTPS_HTTP_PORT}:80" -p "${HTTPS_PORT}:443" \
    -e "DOMAIN=${HTTPS_DOMAIN}" \
    -e "EDITOR_APP_URL=${HTTPS_EDITOR_URL}" \
    -e "API_PUBLIC_URL=${HTTPS_API_URL}" \
    -e "PUBLIC_SITE_URL=${HTTPS_SITE_URL}"
  # What the browser cannot say: how the connection was made, and what the
  # server sent with it. Host names resolve to this machine, as above.
  check "the editor answers over HTTPS" \
    test "$(status_code -k "${HTTPS_EDITOR_URL}/")" = 200
  check "the site answers over HTTPS, at the name itself" \
    test "$(status_code -k "${HTTPS_SITE_URL}/api/health")" = 200
  check "the API answers over HTTPS, at its own name" \
    test "$(status_code -k "${HTTPS_API_URL}/health")" = 200
  check "the certificate is Caddy's, which is what a local name gets" \
    sh -c "echo | openssl s_client -connect 'admin.${HTTPS_DOMAIN}:${HTTPS_PORT}' -servername 'admin.${HTTPS_DOMAIN}' 2>/dev/null | openssl x509 -noout -issuer | grep -q 'Caddy Local Authority'"
  check "every response asks browsers to stay on HTTPS (HSTS)" \
    sh -c "curl -skI '${HTTPS_EDITOR_URL}/' | grep -qi '^strict-transport-security:'"
  check "port 80 sends a browser to HTTPS (308)" \
    test "$(status_code "http://admin.${HTTPS_DOMAIN}:${HTTPS_HTTP_PORT}/")" = 308
  # The half that is not Caddy's: the three halves are inside, and this container
  # published only 80 and 443, so there is no way to them that skips the proxy.
  check "the editor was told the HTTPS addresses, not the plain ones" \
    sh -c "curl -sk '${HTTPS_EDITOR_URL}/config.js' | grep -q 'apiUrl.*https://api.${HTTPS_DOMAIN}:${HTTPS_PORT}/api'"
  docker rm -fv "$HTTPS" >/dev/null
  docker volume rm "$HTTPS_VOLUME" >/dev/null 2>&1 || true
fi

# --- start ---------------------------------------------------------------------

step "start Mailpit and the image: $IMAGE"
docker run -d --name "$MAILPIT" -p "${SMTP_PORT}:1025" -p "${MAILPIT_PORT}:8025" axllent/mailpit >/dev/null
# `host-gateway` is what makes the host reachable from the container on Linux,
# where `host.docker.internal` is not defined by default; Docker Desktop has it.
docker run -d --name "$NAME" \
  --add-host host.docker.internal:host-gateway \
  -p "${EDITOR_PORT}:80" -p "${API_PORT}:3000" -p "${SITE_PORT}:4322" \
  -e "EDITOR_APP_URL=${EDITOR_URL}" \
  -e "API_PUBLIC_URL=${API_URL}" \
  -e "PUBLIC_SITE_URL=${SITE_URL}" \
  -e SMTP_HOST=host.docker.internal -e "SMTP_PORT=${SMTP_PORT}" -e SMTP_FROM_ADDRESS=kometio@localhost \
  -e "TURNSTILE_SITE_KEY=${TURNSTILE_TEST_SITE_KEY}" -e "TURNSTILE_SECRET_KEY=${TURNSTILE_TEST_SECRET_KEY}" \
  -v "${VOLUME}:/data" \
  "$IMAGE" >/dev/null
seconds="$(wait_for_banners 1)"
pass "ready after ${seconds}s (the 'Kometio is ready' banner, not the health check: that one comes first)"

# --- a new installation ---------------------------------------------------------

step "a new installation, before anyone has set it up"
check "the API answers its health check" curl -sf "${API_URL}/health"
check "it says it has not been set up" sh -c "curl -s '${API_URL}/setup/status' | grep -q '\"hasBeenSetUp\":false'"
SHOWN_TOKEN="$(setup_token)"
check "the banner shows a setup token (43 characters)" test "${#SHOWN_TOKEN}" = 43
check "the editor serves its three addresses and the captcha key" sh -c "
  curl -s '${EDITOR_URL}/config.js' | grep -q 'apiUrl.*${API_URL}' &&
  curl -s '${EDITOR_URL}/config.js' | grep -q 'publicSiteUrl.*${SITE_URL}' &&
  curl -s '${EDITOR_URL}/config.js' | grep -q 'turnstileSiteKey.*${TURNSTILE_TEST_SITE_KEY}'"
check "the editor's policy lets the captcha load" sh -c "curl -sI '${EDITOR_URL}/' | grep -i content-security-policy | grep -q challenges.cloudflare.com"
# The other half of the rule: with Cloudflare's keys there is no challenge of ours.
check "with Turnstile keys the API has no challenge of its own (404)" test "$(status_code "${API_URL}/captcha/challenge")" = 404
# Its own health check, not a page: until the first account exists the site has
# no tenant to show, and its pages answer 500.
check "the public site answers its health check" curl -sf "${SITE_URL}/api/health"
# A login left on this host by another installation must not stand in the way
# of the setup form: it used to get a 503, and the editor a white page.
check "a left-over login cookie is 'no session' (401), not a 503" \
  test "$(status_code -H 'Cookie: kometio_session=left-over-from-another-install' "${API_URL}/auth/session")" = 401

# --- the first account, as the wizard makes it ----------------------------------

step "the first account, with the site's address"
# What the editor's setup form sends. It proposes the hostname of the address the
# deployment was told to serve the site on (here http://localhost:15322), and the
# site is found by that name, so the request carries it: nothing has to be set by
# hand afterwards for the site to answer.
SITE_DOMAIN=localhost
TOKEN="$(setup_token)"
CODE="$(curl -s -o /dev/null -c "$COOKIES" -w '%{http_code}' -H 'content-type: application/json' \
  -d "{\"setupToken\":\"${TOKEN}\",\"siteName\":\"Check Site\",\"defaultLocale\":\"en\",\"domain\":\"${SITE_DOMAIN}\",\"adminEmail\":\"${ADMIN_EMAIL}\",\"adminPassword\":\"${ADMIN_PASSWORD}\"}" \
  "${API_URL}/setup")"
if [ "$CODE" = 201 ]; then pass "the wizard's request creates the administrator (201)"; else fail "the wizard's request answers ${CODE}, not 201"; fi
check "the site holds the address it was given" sh -c "curl -s -b '$COOKIES' '${API_URL}/sites/current' | grep -q '\"domain\":\"${SITE_DOMAIN}\"'"
check "the site answers at its address at once, with its name" sh -c "curl -sL '${SITE_URL}/' | grep -q '<title>Check Site'"
# A setup form that sends a name nothing would match is refused, not stored.
check "an address that is not a hostname is refused (400)" test "$(status_code -H 'content-type: application/json' -d '{"setupToken":"x","siteName":"x","defaultLocale":"en","domain":"https://nope.test/","adminEmail":"a@example.test","adminPassword":"a-long-enough-password"}' "${API_URL}/setup")" = 400
check "the new session is valid" test "$(status_code -b "$COOKIES" "${API_URL}/auth/session")" = 200
check "a made-up session is not" test "$(status_code -H 'Cookie: kometio_session=made-up' "${API_URL}/auth/session")" = 401

# --- it survives a restart ------------------------------------------------------

step "a restart keeps everything"
tokens_before="$(docker logs "$NAME" 2>&1 | grep -c 'enter this setup token' || true)"
docker restart "$NAME" >/dev/null
seconds="$(wait_for_banners 2)"
pass "ready again after ${seconds}s"
check "it is still set up" sh -c "curl -s '${API_URL}/setup/status' | grep -q '\"hasBeenSetUp\":true'"
tokens_after="$(docker logs "$NAME" 2>&1 | grep -c 'enter this setup token' || true)"
check "no new setup token is asked for" test "$tokens_after" = "$tokens_before"
check "the same session is still valid" test "$(status_code -b "$COOKIES" "${API_URL}/auth/session")" = 200
check "the site is still served" sh -c "curl -sL '${SITE_URL}/' | grep -q '<title>Check Site'"

# --- moving the site ------------------------------------------------------------
#
# docs/adr/0105. The site above, with an uploaded file in it, is exported while
# the server runs; the archive is opened into a volume that has never been used
# (the server is not running there: a database is made again under it); and the
# result is started under another address. It has to be the same site with
# nothing to set up, and it must not be a way to keep what was only a moment.
step "moving the site: export, import into a new volume, start it elsewhere"
SITE_ID="$(curl -s -b "$COOKIES" "${API_URL}/sites/current" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)"
node -e "require('fs').writeFileSync(process.argv[1], Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))" "${WORK}/pixel.png"
UPLOADED="$(curl -s -b "$COOKIES" -H "Origin: ${EDITOR_URL}" -F "siteId=${SITE_ID}" -F "file=@${WORK}/pixel.png;type=image/png" "${API_URL}/media" | grep -o '/uploads/[^"]*' | head -1)"
check "a file is uploaded to the site that will be exported" test -n "$UPLOADED"
check "the server exports its site while it runs" \
  sh -c "docker exec '$NAME' node /opt/kometio/cli.mjs export > '${WORK}/site.tar.gz'"
check "the archive is a .tar.gz with its manifest, its database and its uploads" \
  sh -c "tar tzf '${WORK}/site.tar.gz' | grep -q 'manifest.json' && tar tzf '${WORK}/site.tar.gz' | grep -q 'database.sql.gz' && tar tzf '${WORK}/site.tar.gz' | grep -q 'uploads/'"

# The same archive through the editor's door (Settings → Export, docs/adr/0105):
# the API asks the launcher on a socket and streams what comes back. It is the one
# that is opened below, since it is the one a person has.
check "the server says its site can be exported (the single image makes the archive)" \
  sh -c "curl -s '${API_URL}/deployment' | grep -q '\"siteArchive\":true'"
check "nobody signed in is refused the archive (401)" \
  test "$(status_code "${API_URL}/site-archive")" = 401
check "a link followed from another site is refused (403)" \
  test "$(status_code -b "$COOKIES" -H 'Sec-Fetch-Site: cross-site' "${API_URL}/site-archive")" = 403
check "an administrator downloads the archive while the server runs" \
  sh -c "curl -sf -b '$COOKIES' -D '${WORK}/export.headers' -o '${WORK}/site-from-editor.tar.gz' '${API_URL}/site-archive'"
check "it is sent as a file to keep, named, and never from a cache" \
  sh -c "grep -qi '^content-type: application/gzip' '${WORK}/export.headers' && grep -qi '^content-disposition: attachment; filename=\"kometio-site-[0-9]*-[0-9]*.tar.gz\"' '${WORK}/export.headers' && grep -qi '^cache-control: no-store' '${WORK}/export.headers'"
check "it is not compressed a second time on its way" \
  sh -c "! grep -qi '^content-encoding:' '${WORK}/export.headers'"
check "it is an archive of the same shape as the command's: manifest, database and uploads" \
  sh -c "tar tzf '${WORK}/site-from-editor.tar.gz' | grep -q 'manifest.json' && tar tzf '${WORK}/site-from-editor.tar.gz' | grep -q 'database.sql.gz' && tar tzf '${WORK}/site-from-editor.tar.gz' | grep -q 'uploads/'"
# One at a time, and a reader who leaves must not leave the next one waiting: the
# first is read slowly, so that it is still being made; the second is refused; and
# once the first reader is gone the launcher lets go and the next one is made. A
# site this small is archived faster than anything can be read slowly (a few
# megabytes of it sit in the sockets' buffers), so it is given 40 MB of bytes that
# do not compress, where the uploads are; they are taken away again below.
docker exec "$NAME" sh -c "head -c 40000000 /dev/urandom > /data/uploads/ballast.bin && chown kometio:kometio /data/uploads/ballast.bin"
curl -s -b "$COOKIES" --limit-rate 1k -o /dev/null "${API_URL}/site-archive" &
SLOW_READER=$!
sleep 3
check "a second export while one is being made is refused (409)" \
  test "$(status_code -b "$COOKIES" "${API_URL}/site-archive")" = 409
kill "$SLOW_READER" 2>/dev/null || true
wait "$SLOW_READER" 2>/dev/null || true
sleep 3
check "when the reader leaves, the next export is made" \
  test "$(status_code -b "$COOKIES" "${API_URL}/site-archive")" = 200
check "and nothing of the unfinished one is left on the volume" \
  sh -c "test \"\$(docker exec '$NAME' sh -c 'ls /data/state | grep -c ^export- || true')\" = 0"
docker exec "$NAME" rm -f /data/uploads/ballast.bin
# The socket is the launcher's door, and only the API's user can open it: the user
# a theme's code runs as cannot even reach the folder it is in.
check "the API's own user can open the control socket (the control of the next check)" \
  docker exec -u kometio "$NAME" node -e "require('net').connect('/run/kometio/control.sock').on('connect', () => process.exit(0)).on('error', () => process.exit(1))"
check "the user a theme's code runs as cannot open it" \
  sh -c "! docker exec -u kometio-site '$NAME' node -e \"require('net').connect('/run/kometio/control.sock').on('connect', () => process.exit(0)).on('error', () => process.exit(1))\""
check "a file that is not an archive is refused, and nothing is started for it" \
  sh -c "! echo 'not an archive' | docker run --rm -i -v '${MOVED_VOLUME}:/data' '$IMAGE' import 2>/dev/null"
# The one thing that must never happen: a second container starting Postgres on
# files the first has open. Nothing in Docker or in Postgres can tell it from here
# (the pid file names a process in another container), so the command looks for the
# pid file and refuses; this is the check of that, and of what it protected.
check "an import onto a volume that a running server uses is refused" \
  sh -c "! docker run --rm -i -v '${VOLUME}:/data' '$IMAGE' import < '${WORK}/site.tar.gz' 2>/dev/null"
check "and that server's database was not touched: its pid file is still there" \
  docker exec "$NAME" test -f /data/postgres/postmaster.pid
check "the archive the editor gave is opened into a new volume, under another address" \
  sh -c "docker run --rm -i -v '${MOVED_VOLUME}:/data' -e 'PUBLIC_SITE_URL=http://moved.localhost:${MOVED_SITE_PORT}' '$IMAGE' import < '${WORK}/site-from-editor.tar.gz'"
check "it is not opened a second time over what is there" \
  sh -c "! docker run --rm -i -v '${MOVED_VOLUME}:/data' '$IMAGE' import < '${WORK}/site-from-editor.tar.gz' 2>/dev/null"
docker run -d --name "$MOVED" \
  -p "${MOVED_EDITOR_PORT}:80" -p "${MOVED_API_PORT}:3000" -p "${MOVED_SITE_PORT}:4322" \
  -e "EDITOR_APP_URL=http://localhost:${MOVED_EDITOR_PORT}" \
  -e "API_PUBLIC_URL=http://localhost:${MOVED_API_PORT}/api" \
  -e "PUBLIC_SITE_URL=http://moved.localhost:${MOVED_SITE_PORT}" \
  -e "TURNSTILE_SITE_KEY=${TURNSTILE_TEST_SITE_KEY}" -e "TURNSTILE_SECRET_KEY=${TURNSTILE_TEST_SECRET_KEY}" \
  -v "${MOVED_VOLUME}:/data" \
  "$IMAGE" >/dev/null
wait_for_banners 1 "$MOVED" >/dev/null
MOVED_API_URL="http://localhost:${MOVED_API_PORT}/api"
check "the moved site is already set up: no wizard" sh -c "curl -s '${MOVED_API_URL}/setup/status' | grep -q '\"hasBeenSetUp\":true'"
check "and it asks for no setup token" test -z "$(setup_token "$MOVED")"
# Cloudflare's test secret is checked by a call to Cloudflare, which a busy minute
# can refuse; the account is what is being proved here, so a refusal is asked again.
LOGIN_CODE=000
for attempt in 1 2 3; do
  LOGIN_CODE="$(status_code -H 'content-type: application/json' -H "Origin: http://localhost:${MOVED_EDITOR_PORT}" \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\",\"captchaToken\":\"x\"}" "${MOVED_API_URL}/auth/login")"
  [ "$LOGIN_CODE" = 200 ] && break
  [ "$attempt" -lt 3 ] && sleep 3
done
if [ "$LOGIN_CODE" = 200 ]; then
  pass "the account came with it: the same password signs in"
else
  fail "the account came with it: the same password signs in (the login answered ${LOGIN_CODE})"
fi
check "nobody is signed in that was signed in there: a session does not travel" \
  test "$(status_code -b "$COOKIES" "${MOVED_API_URL}/auth/session")" = 401
check "the site is the same one" sh -c "curl -sL 'http://moved.localhost:${MOVED_SITE_PORT}/' | grep -q '<title>Check Site'"
check "and it answers at the new address only: its old name finds nothing" \
  test "$(status_code -L "http://localhost:${MOVED_SITE_PORT}/")" = 404
check "the uploaded file came with it" test "$(status_code "${MOVED_API_URL}${UPLOADED}")" = 200
docker rm -fv "$MOVED" >/dev/null
docker volume rm "$MOVED_VOLUME" >/dev/null 2>&1 || true

# --- the browser suite ----------------------------------------------------------

if [ "$SMOKE_ONLY" = false ]; then
  step "the end-to-end suite, against this image"
  # Every address and the account are set here, none left to the root .env:
  # a variable that is missing would otherwise be read from it, and that file
  # can name a developer's own database.
  if (
    cd "$(git rev-parse --show-toplevel)"
    VITE_API_URL="$API_URL" EDITOR_APP_URL="$EDITOR_URL" VITE_PUBLIC_SITE_URL="$SITE_URL" \
      MAILPIT_URL="http://localhost:${MAILPIT_PORT}" \
      DEFAULT_USER_EMAIL="$ADMIN_EMAIL" DEFAULT_USER_PASSWORD="$ADMIN_PASSWORD" \
      pnpm exec nx run @kometio/e2e:e2e -- --config=playwright.image.config.ts
  ); then
    pass "the end-to-end suite passed"
  else
    fail "the end-to-end suite failed"
  fi
fi

# --- it stops cleanly ------------------------------------------------------------

step "stopping"
started=$(date +%s)
docker stop -t 30 "$NAME" >/dev/null
elapsed=$(($(date +%s) - started))
exit_code="$(docker inspect -f '{{.State.ExitCode}}' "$NAME")"
if [ "$exit_code" = 0 ]; then pass "it stopped with exit code 0, in ${elapsed}s"; else fail "it stopped with exit code ${exit_code}"; fi

echo
if [ "$failed" -eq 0 ]; then
  echo "All checks passed."
else
  echo "Some checks failed." >&2
  exit 1
fi
