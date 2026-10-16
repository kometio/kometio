#!/usr/bin/env bash
#
# Starts a Kometio image the way docker/kometio/README.md says, proves that it
# works, and runs the end-to-end suite against it.
#
#   docker/kometio/check.sh IMAGE                          run everything
#   docker/kometio/check.sh IMAGE --smoke-only             skip the browser suite
#   docker/kometio/check.sh IMAGE --upgrade-from OLD       also open a site made by OLD
#
# CI runs this on every pull request (against an image built from the
# branch, with --upgrade-from the version the README tells people to install)
# and, with --smoke-only, on the image it is about to publish. You can run it
# the same way on your machine: it needs Docker, curl, node and openssl, and,
# for the full run, `pnpm install` done and Playwright's Chromium.
#
# It uses names and ports of its own (`kometio-check*`, 15200/15000/15322, the
# server with a name on 18080/18443, and Mailpit on 11025/18025), so it can run
# next to your development stack, and it
# refuses to start if one of those names is taken: what it removes at the end
# is only what it created.
set -euo pipefail

USAGE="usage: docker/kometio/check.sh IMAGE [--smoke-only] [--upgrade-from OLD_IMAGE]"
IMAGE="${1:?$USAGE}"
shift
SMOKE_ONLY=false
UPGRADE_FROM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --smoke-only) SMOKE_ONLY=true ;;
    --upgrade-from)
      UPGRADE_FROM="${2:?$USAGE}"
      shift
      ;;
    *)
      echo "$USAGE" >&2
      exit 2
      ;;
  esac
  shift
done

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
# The fifth, a new installation that is given that site on its first-run screen
# instead of making one (docs/adr/0106), in a browser.
IMPORTED=kometio-check-imported
IMPORTED_VOLUME=kometio-check-imported-data
# Two volumes for archives that are hostile (docs/adr/0108), each used once.
HOSTILE_VOLUME=kometio-check-hostile-data
LINKED_VOLUME=kometio-check-linked-data
# One more, for a backup opened as a stranger would find it (docs/adr/0119).
BACKUP_VOLUME=kometio-check-backup-data
IMPORTED_EDITOR_PORT=20200
IMPORTED_API_PORT=20000
IMPORTED_SITE_PORT=20322
# The sixth, a site made by the previous release and opened by this image, the way
# the README's "Update to a newer version" does (only with --upgrade-from).
UPGRADE=kometio-check-upgrade
UPGRADE_VOLUME=kometio-check-upgrade-data
UPGRADE_EDITOR_PORT=21200
UPGRADE_API_PORT=21000
UPGRADE_SITE_PORT=21322
# The eighth, a volume that a newer version has migrated, started by this image
# (docs/adr/0119's README, "Update to a newer version"): it has to refuse.
DOWNGRADE=kometio-check-downgrade
DOWNGRADE_VOLUME=kometio-check-downgrade-data
# The seventh, only to read its log: started with JSON logs and an access log
# (docs/adr/0122), and asked one request.
LOGJSON=kometio-check-logjson
LOGJSON_VOLUME=kometio-check-logjson-data
LOGJSON_API_PORT=22000
# The ninth, a server with a name that is asked one request carrying a secret in
# every place a request has one, to read what the proxy wrote (docs/adr/0126).
PROXYLOG=kometio-check-proxylog
PROXYLOG_VOLUME=kometio-check-proxylog-data
PROXYLOG_DOMAIN=kometio-check-proxylog.localhost
PROXYLOG_HTTP_PORT=19080
PROXYLOG_HTTPS_PORT=19443
EDITOR_PORT=15200
API_PORT=15000
SITE_PORT=15322
SMTP_PORT=11025
MAILPIT_PORT=18025
EDITOR_URL="http://localhost:${EDITOR_PORT}"
API_URL="http://localhost:${API_PORT}/api"
SITE_URL="http://localhost:${SITE_PORT}"
# What answers the captcha of a request that has no browser: the API's own
# challenge, solved the way the widget solves it (docs/adr/0103). It needs
# nothing but node, which is what this script asks of the machine.
SOLVE_CAPTCHA="$(git rev-parse --show-toplevel)/tools/solve-captcha.mjs"
# A request body for /auth/login, with a captcha solved for it: a token is spent
# once, so each login asks for its own. $1 the API's address, $2 the password.
login_body() {
  local captcha
  captcha="$(node "$SOLVE_CAPTCHA" "$1")"
  printf '{"email":"%s","password":"%s","captchaToken":"%s"}' "$ADMIN_EMAIL" "$2" "$captcha"
}

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
    for other in "$FIRST" "$HTTPS" "$MOVED" "$IMPORTED" "$UPGRADE" "$LOGJSON" "$DOWNGRADE" "$PROXYLOG"; do
      if docker ps -a --format '{{.Names}}' | grep -qx "$other"; then
        printf '\n== the last lines of the log of %s\n' "$other"
        docker logs --tail 40 "$other" 2>&1 || true
      fi
    done
  fi
  docker rm -fv "$NAME" "$MAILPIT" "$FIRST" "$HTTPS" "$MOVED" "$IMPORTED" "$UPGRADE" "$LOGJSON" "$DOWNGRADE" "$PROXYLOG" >/dev/null 2>&1 || true
  # Only the volumes this script made: the checks below guarantee they did not exist.
  docker volume rm "$VOLUME" "$FIRST_VOLUME" "$HTTPS_VOLUME" "$MOVED_VOLUME" "$IMPORTED_VOLUME" "$HOSTILE_VOLUME" "$LINKED_VOLUME" "$BACKUP_VOLUME" "$UPGRADE_VOLUME" "$LOGJSON_VOLUME" "$DOWNGRADE_VOLUME" "$PROXYLOG_VOLUME" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}

# --- before anything is started -------------------------------------------------
#
# These come BEFORE the trap that cleans up: stopping here because a name is
# taken must not remove the thing that holds it.

for taken in "$NAME" "$MAILPIT" "$FIRST" "$HTTPS" "$MOVED" "$IMPORTED" "$UPGRADE" "$DOWNGRADE" "$PROXYLOG"; do
  if docker ps -a --format '{{.Names}}' | grep -qx "$taken"; then
    echo "A container named $taken already exists: remove it first (this script removes what it creates, and would remove that too)." >&2
    exit 2
  fi
done
for taken in "$VOLUME" "$FIRST_VOLUME" "$HTTPS_VOLUME" "$MOVED_VOLUME" "$IMPORTED_VOLUME" "$HOSTILE_VOLUME" "$LINKED_VOLUME" "$BACKUP_VOLUME" "$UPGRADE_VOLUME" "$LOGJSON_VOLUME" "$DOWNGRADE_VOLUME" "$PROXYLOG_VOLUME"; do
  if docker volume ls -q | grep -qx "$taken"; then
    echo "A volume named $taken already exists: remove it first." >&2
    exit 2
  fi
done

WORK="$(mktemp -d)"
COOKIES="${WORK}/cookies.txt"
trap cleanup EXIT
# The smallest file an upload takes: a one-pixel PNG, for the scenarios that put a
# file in a site.
node -e "require('fs').writeFileSync(process.argv[1], Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))" "${WORK}/pixel.png"

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

# The major version of the Postgres an image carries: a volume that one major made
# is not opened by another (docs/adr/0125).
postgres_major() {
  docker run --rm --entrypoint postgres "$1" --version | sed -E 's/.*\(PostgreSQL\) ([0-9]+).*/\1/'
}

# Waits for a container that is expected to stop by itself, up to $2 seconds. A
# container still running after that is for the check after it to report.
until_exited() {
  local waited=0
  until [ "$(docker inspect -f '{{.State.Status}}' "$1")" != "running" ] || [ "$waited" -ge "$2" ]; do
    sleep 1
    waited=$((waited + 1))
  done
}

# --- the part of the launcher that is only logic ---------------------------------
#
# What DOMAIN may be and the addresses it makes (docs/adr/0104), and when an
# archive is trusted (docs/adr/0105): no container needed, so it is asked first.
step "the launcher's own logic"
check "DOMAIN is read as documented, and a mistake in it says what to write" \
  node --test "$(git rev-parse --show-toplevel)/docker/kometio/server-mode.test.mjs"
check "an archive is trusted as documented: its manifest, its migrations, what it may hold" \
  node --test "$(git rev-parse --show-toplevel)/docker/kometio/archive.test.mjs"
check "an archive that does not end, or that is larger than the volume has room for, is refused while it is read and not when the disk is full" \
  node --test "$(git rev-parse --show-toplevel)/docker/kometio/archive-commands.test.mjs"
check "the launcher's control socket answers as documented: one archive at a time, a refusal before it starts, a cut when it fails on its way" \
  node --test "$(git rev-parse --show-toplevel)/docker/kometio/control-server.test.mjs"
check "a site opened from an archive is stopped, restored and started again as documented" \
  node --test "$(git rev-parse --show-toplevel)/docker/kometio/site-import.test.mjs"
check "every table of the schema is a site's or a moment's, so that no new one is carried by accident" \
  node --test "$(git rev-parse --show-toplevel)/docker/kometio/archive-tables.test.mjs"
check "a volume that another major version of Postgres made is refused with what to do, and one of the same major is not" \
  node --test "$(git rev-parse --show-toplevel)/docker/kometio/embedded-postgres.test.mjs"
check "the healthcheck looks at the three parts, on the ports the launcher gives them" \
  node --test "$(git rev-parse --show-toplevel)/docker/kometio/healthcheck.test.mjs"
check "the processes live and die together as documented: one that stops takes the others, one stopped on purpose does not, every stop is in the same order with the same time to leave" \
  node --test "$(git rev-parse --show-toplevel)/docker/kometio/process-supervisor.test.mjs"
check "each part is told what it reads and no more: the API never gets the database administrator, the site only its own variables" \
  node --test "$(git rev-parse --show-toplevel)/docker/kometio/service-environments.test.mjs"
check "a line of the log is written as text or as JSON, and a part that wrote a JSON object keeps it" \
  node --test "$(git rev-parse --show-toplevel)/docker/kometio/log-format.test.mjs"
check "every module the container starts on is copied into the image, so that a new file cannot be a container that does not start" \
  node --test "$(git rev-parse --show-toplevel)/docker/kometio/image-contents.test.mjs"
check "every page that tells a person which version of the image to run says the same one" \
  node --test "$(git rev-parse --show-toplevel)/docker/kometio/image-tag.test.mjs"

# --- the first run, in a browser ------------------------------------------------
#
# On an installation of its own, started the way the quickstart says: no mail
# server, and an address only because this machine's default ports may be taken.
# The main installation below is given a mail server so that the rest of the
# suite can use it, and that hides what a person meets first (docs/adr/0101): a
# login left on the host by another installation, a site "not found".
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
  # No mail server (docs/adr/0103): the invitation the test made gave its link
  # to the administrator on the screen, and the log says it was made and nothing
  # of the link (docs/adr/0128); a reset has nobody to give it to, so it is in
  # the log. Without this a quiet log would pass for a working mailer.
  log="$(docker logs "$container" 2>&1 || true)"
  check "an invitation with no mail server is told to the log" \
    grep -q "nothing was sent to ${INVITEE_EMAIL}" <<<"$log"
  if grep -q "accept-invite?inviteToken=" <<<"$log"; then
    fail "the log holds the invitation's link"
  else
    pass "the log does not hold the invitation's link"
  fi
  check "a password reset with no mail server is written to the log, link included" \
    grep -q "${editor_url}/reset-password?resetToken=" <<<"$log"
  # The captcha is the one built into Kometio (docs/adr/0103), and it hands out
  # a signed challenge to anyone who asks (the login of the test above solved one).
  check "the API hands out a challenge of its own" \
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
check "the editor serves its two addresses" sh -c "
  curl -s '${EDITOR_URL}/config.js' | grep -q 'apiUrl.*${API_URL}' &&
  curl -s '${EDITOR_URL}/config.js' | grep -q 'publicSiteUrl.*${SITE_URL}'"
# The captcha is solved in the page and checked by the API: nothing is loaded
# from, or sent to, anyone else (docs/adr/0145).
check "the editor's policy names no one else for scripts or frames" \
  sh -c "! curl -sI '${EDITOR_URL}/' | grep -i content-security-policy | grep -qi 'cloudflare'"
check "the API hands out a challenge, signed" \
  sh -c "curl -sf '${API_URL}/captcha/challenge' | grep -q '\"signature\"'"
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
# Three times, at once, as a double click or a retry sends it: the token is the
# same in all of them, and it is spent only when the first has finished. One of
# them makes the installation; the others are refused. If two went through, the
# installation would have two tenants, which it refuses to serve (a 500 on every
# request after that, for good).
SETUP_BODY="{\"setupToken\":\"${TOKEN}\",\"siteName\":\"Check Site\",\"defaultLocale\":\"en\",\"domain\":\"${SITE_DOMAIN}\",\"adminEmail\":\"${ADMIN_EMAIL}\",\"adminPassword\":\"${ADMIN_PASSWORD}\"}"
for attempt in 1 2 3; do
  curl -s -o /dev/null -c "${WORK}/setup-${attempt}.cookies" -w '%{http_code}' -H 'content-type: application/json' \
    -d "$SETUP_BODY" "${API_URL}/setup" >"${WORK}/setup-${attempt}.code" &
done
wait
CREATED=0
for attempt in 1 2 3; do
  if [ "$(cat "${WORK}/setup-${attempt}.code")" = 201 ]; then
    CREATED=$((CREATED + 1))
    cp "${WORK}/setup-${attempt}.cookies" "$COOKIES"
  fi
done
if [ "$CREATED" = 1 ]; then pass "of three setup requests at once, one creates the administrator (201)"; else fail "of three setup requests at once, ${CREATED} answered 201: $(cat "${WORK}"/setup-*.code | tr '\n' ' ')"; fi
check "and the installation has one tenant, so it can be served" \
  test "$(docker exec "$NAME" psql -h /run/postgresql -U kometio -d kometio -Atc 'select count(*) from tenants')" = 1
check "the site holds the address it was given" sh -c "curl -s -b '$COOKIES' '${API_URL}/sites/current' | grep -q '\"domain\":\"${SITE_DOMAIN}\"'"
check "the site answers at its address at once, with its name" sh -c "curl -sL '${SITE_URL}/' | grep -q '<title>Check Site'"
# The bundles carry the hash of their content in their names, so they are kept
# for good; a page is rendered per request (its policy has a nonce of its own)
# and says nothing of the sort.
SITE_BUNDLE="$(curl -sL "${SITE_URL}/" | grep -o '/_astro/[^"]*\.css' | head -1)"
check "the site's hashed bundles are kept for good" \
  sh -c "curl -sI '${SITE_URL}${SITE_BUNDLE}' | tr -d '\r' | grep -qi '^cache-control: public, max-age=31536000, immutable$'"
check "and a page is not" \
  sh -c "! curl -sIL '${SITE_URL}/' | grep -qi '^cache-control: .*immutable'"
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

# --- an older image on a newer volume ---------------------------------------------
#
# Migrations only go forward, so an image that does not know a migration the
# volume has must not start on it: it would run a schema it was not written for,
# and the way back is a restore. The newer version is made here by a row in the
# journal that no migration of this image has, which is what one that the image
# does not know looks like to it. It has to stop, say so, and leave the database
# alone (no migration run, no part started).
step "a volume that a newer version has migrated is not started by this image"
docker run -d --name "$DOWNGRADE" --stop-timeout 30 -v "${DOWNGRADE_VOLUME}:/data" "$IMAGE" >/dev/null
wait_for_banners 1 "$DOWNGRADE" >/dev/null
check "a volume the image made is opened by it" \
  docker exec "$DOWNGRADE" psql -h /run/postgresql -U kometio -d kometio -Atc 'select 1 from drizzle.__drizzle_migrations limit 1'
docker exec "$DOWNGRADE" psql -h /run/postgresql -U kometio -d kometio -Atc \
  "insert into drizzle.__drizzle_migrations (hash, created_at) values ('made-by-a-newer-version', 4102444800000)" >/dev/null
docker stop -t 30 "$DOWNGRADE" >/dev/null
READY_BEFORE="$(banners "$DOWNGRADE")"
UP_TO_DATE_BEFORE="$(docker logs "$DOWNGRADE" 2>&1 | grep -c 'migrations are up to date' || true)"
docker start "$DOWNGRADE" >/dev/null
# It stops by itself, which is a refusal and not a part that died: a container
# that is still running after this long is the check failing.
until_exited "$DOWNGRADE" 90
check "an image that does not know a migration of the volume stops, with an error" \
  test "$(docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$DOWNGRADE")" = "exited 1"
check "and says that the volume was made by a newer Kometio" \
  sh -c "docker logs '$DOWNGRADE' 2>&1 | grep -q 'this volume was made by a newer Kometio than this image'"
check "and tells what to do instead: start the version that made it, or open the export" \
  sh -c "docker logs '$DOWNGRADE' 2>&1 | grep -q 'Start the version that made it'"
check "it ran no migration" \
  test "$(docker logs "$DOWNGRADE" 2>&1 | grep -c 'migrations are up to date' || true)" = "$UP_TO_DATE_BEFORE"
check "and started nothing: no new banner" \
  test "$(banners "$DOWNGRADE")" = "$READY_BEFORE"
docker rm -fv "$DOWNGRADE" >/dev/null

# --- a site made by the previous release ----------------------------------------
#
# Every scenario here starts from an empty volume, so none of them can see what a
# change does to a site that already exists: a migration that fails on real rows,
# a folder the old image made with another owner, a secret the new launcher reads
# differently. This one makes a site with the version people have, and does what
# the README's "Update to a newer version" says: export, stop with thirty seconds,
# start this image on the same volume. Asked for with --upgrade-from.
#
# When the two images carry different majors of Postgres, which do not read each
# other's files (docs/adr/0125), the same volume is refused and the way across is
# the export: it is opened into a new volume. That is what is run then, and what
# is checked of the site is the same.
if [ -n "$UPGRADE_FROM" ]; then
  step "an upgrade: a site made by ${UPGRADE_FROM}, opened by this image"
  UPGRADE_EDITOR_URL="http://localhost:${UPGRADE_EDITOR_PORT}"
  UPGRADE_API_URL="http://localhost:${UPGRADE_API_PORT}/api"
  UPGRADE_SITE_URL="http://localhost:${UPGRADE_SITE_PORT}"
  UPGRADE_COOKIES="${WORK}/upgrade.cookies"
  UPGRADE_PASSWORD="$(openssl rand -hex 16)"

  # The same flags for both versions, as the README's step 3 has it.
  start_upgrade() {
    docker run -d --name "$UPGRADE" --stop-timeout 30 \
      -p "${UPGRADE_EDITOR_PORT}:80" -p "${UPGRADE_API_PORT}:3000" -p "${UPGRADE_SITE_PORT}:4322" \
      -e "EDITOR_APP_URL=${UPGRADE_EDITOR_URL}" \
      -e "API_PUBLIC_URL=${UPGRADE_API_URL}" \
      -e "PUBLIC_SITE_URL=${UPGRADE_SITE_URL}" \
      -v "${UPGRADE_VOLUME}:/data" \
      "$1" >/dev/null
  }
  # The first "id" in a JSON answer; nothing when there is none, so that the check
  # after it says what failed instead of the script stopping here.
  json_id() { { grep -o '"id":"[^"]*"' || true; } | head -1 | cut -d'"' -f4; }

  docker pull -q "$UPGRADE_FROM" >/dev/null
  start_upgrade "$UPGRADE_FROM"
  wait_for_banners 1 "$UPGRADE" >/dev/null
  # Bodies are made in a variable, not inside the command substitution that
  # sends them: bash expands a brace pair there (`{"a":"b","c":"d"}`) into words
  # when a $(...) is nested in the string.
  UPGRADE_SETUP_BODY="{\"setupToken\":\"$(setup_token "$UPGRADE")\",\"siteName\":\"Upgrade Site\",\"defaultLocale\":\"en\",\"domain\":\"localhost\",\"adminEmail\":\"${ADMIN_EMAIL}\",\"adminPassword\":\"${UPGRADE_PASSWORD}\"}"
  check "the previous release is set up, as it asks" \
    test "$(status_code -c "$UPGRADE_COOKIES" -H 'content-type: application/json' \
      -d "$UPGRADE_SETUP_BODY" "${UPGRADE_API_URL}/setup")" = 201
  UPGRADE_SITE_ID="$(curl -s -b "$UPGRADE_COOKIES" "${UPGRADE_API_URL}/sites/current" | json_id)"
  UPGRADE_PAGE_BODY="{\"siteId\":\"${UPGRADE_SITE_ID}\",\"content\":[],\"translation\":{\"locale\":\"en\",\"slug\":\"made-before-the-upgrade\",\"seoMeta\":{\"title\":\"Made before the upgrade\",\"description\":\"\"}}}"
  UPGRADE_PAGE_ID="$(curl -s -b "$UPGRADE_COOKIES" -H "Origin: ${UPGRADE_EDITOR_URL}" -H 'content-type: application/json' \
    -d "$UPGRADE_PAGE_BODY" "${UPGRADE_API_URL}/page-groups" | json_id)"
  UPGRADE_TRANSLATION_ID="$(curl -s -b "$UPGRADE_COOKIES" "${UPGRADE_API_URL}/page-groups/${UPGRADE_PAGE_ID}/translations" | json_id)"
  check "a page is made and published on it" \
    test "$(status_code -b "$UPGRADE_COOKIES" -H "Origin: ${UPGRADE_EDITOR_URL}" -X POST \
      "${UPGRADE_API_URL}/page-groups/translations/${UPGRADE_TRANSLATION_ID}/publish")" = 201
  UPGRADE_UPLOADED="$(curl -s -b "$UPGRADE_COOKIES" -H "Origin: ${UPGRADE_EDITOR_URL}" -F "siteId=${UPGRADE_SITE_ID}" -F "file=@${WORK}/pixel.png;type=image/png" "${UPGRADE_API_URL}/media" | grep -o '/uploads/[^"]*' | head -1)"
  check "a file is uploaded to it" test -n "$UPGRADE_UPLOADED"
  check "and it serves the page it was given" \
    sh -c "curl -sfL '${UPGRADE_SITE_URL}/en/made-before-the-upgrade' | grep -q 'Made before the upgrade'"
  MIGRATIONS_BEFORE="$(docker exec "$UPGRADE" psql -h /run/postgresql -U kometio -d kometio -Atc 'select count(*) from drizzle.__drizzle_migrations')"

  # What the README's step 1 asks for, made by the version that is being left.
  UPGRADE_EXPORT="${WORK}/upgrade-export.tar.gz"
  check "the old version exports its site first, as the README says" \
    sh -c "docker exec '$UPGRADE' node /opt/kometio/cli.mjs export > '$UPGRADE_EXPORT' && tar tzf '$UPGRADE_EXPORT' | grep -q manifest.json"
  docker stop -t 30 "$UPGRADE" >/dev/null
  docker rm "$UPGRADE" >/dev/null

  UPGRADE_POSTGRES_BEFORE="$(postgres_major "$UPGRADE_FROM")"
  UPGRADE_POSTGRES_AFTER="$(postgres_major "$IMAGE")"
  if [ "$UPGRADE_POSTGRES_BEFORE" != "$UPGRADE_POSTGRES_AFTER" ]; then
    pass "Postgres goes from ${UPGRADE_POSTGRES_BEFORE} to ${UPGRADE_POSTGRES_AFTER}: the volume is refused, and the export is the way across"
    start_upgrade "$IMAGE"
    until_exited "$UPGRADE" 90
    check "this image stops on the old volume, with an error" \
      test "$(docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$UPGRADE")" = "exited 1"
    check "and says which Postgres made it, which this one is, and what to do: export, then open it into a new volume" \
      sh -c "docker logs '$UPGRADE' 2>&1 | grep -q 'made by PostgreSQL ${UPGRADE_POSTGRES_BEFORE}, and this image carries ${UPGRADE_POSTGRES_AFTER}' && docker logs '$UPGRADE' 2>&1 | grep -q 'cli.mjs export' && docker logs '$UPGRADE' 2>&1 | grep -q 'into a new volume'"
    check "it started nothing: no banner" \
      test "$(banners "$UPGRADE")" = 0
    check "and the volume is as it was: still the old Postgres's files" \
      test "$(docker run --rm -v "${UPGRADE_VOLUME}:/data" --entrypoint cat "$IMAGE" /data/postgres/PG_VERSION)" = "$UPGRADE_POSTGRES_BEFORE"
    docker rm "$UPGRADE" >/dev/null
    # The README's way across: a volume that has never been used, into which the
    # export is opened. (The same name, for the rest of this scenario: the old
    # volume is gone, which is what a person who has checked the export does.)
    docker volume rm "$UPGRADE_VOLUME" >/dev/null
    check "the export is opened into a new volume with this image" \
      sh -c "docker run --rm -i -v '${UPGRADE_VOLUME}:/data' '$IMAGE' import < '$UPGRADE_EXPORT'"
  fi

  start_upgrade "$IMAGE"
  seconds="$(wait_for_banners 1 "$UPGRADE")"
  pass "this image is ready on that volume after ${seconds}s"

  check "it is still set up" \
    sh -c "curl -s '${UPGRADE_API_URL}/setup/status' | grep -q '\"hasBeenSetUp\":true'"
  check "no setup token is asked for" \
    test "$(docker logs "$UPGRADE" 2>&1 | grep -c 'enter this setup token' || true)" = 0
  # What an import does not carry is a moment (docs/adr/0105): a session is one.
  if [ "$UPGRADE_POSTGRES_BEFORE" = "$UPGRADE_POSTGRES_AFTER" ]; then
    check "the session made before is still valid" \
      test "$(status_code -b "$UPGRADE_COOKIES" "${UPGRADE_API_URL}/auth/session")" = 200
  fi
  # A captcha is asked of the server that checks it, now and not at the start: a
  # challenge lives ten minutes, and the upgrade took longer than that to get here.
  check "the same password signs in" \
    test "$(status_code -H 'content-type: application/json' \
      -d "$(login_body "$UPGRADE_API_URL" "$UPGRADE_PASSWORD")" "${UPGRADE_API_URL}/auth/login")" = 200
  check "the page is served as it was" \
    sh -c "curl -sfL '${UPGRADE_SITE_URL}/en/made-before-the-upgrade' | grep -q 'Made before the upgrade'"
  check "the file is served as it was" \
    test "$(status_code "http://localhost:${UPGRADE_API_PORT}/api${UPGRADE_UPLOADED}")" = 200
  MIGRATIONS_AFTER="$(docker exec "$UPGRADE" psql -h /run/postgresql -U kometio -d kometio -Atc 'select count(*) from drizzle.__drizzle_migrations')"
  check "the migrations of the old version are kept (${MIGRATIONS_BEFORE}), and this one's added to them (${MIGRATIONS_AFTER})" \
    test "$MIGRATIONS_AFTER" -ge "$MIGRATIONS_BEFORE"
  check "it exports the site, so the next update can start from one too" \
    sh -c "docker exec '$UPGRADE' node /opt/kometio/cli.mjs export | tar tzf - | grep -q manifest.json"
  # An installation made before the socket was closed (docs/adr/0107) is the one
  # that most needs it to be: nobody starts those again from scratch.
  check "the database's socket is closed to the user a theme's code runs as, on the old volume too" \
    sh -c "docker exec -u kometio-site '$UPGRADE' psql -h /run/postgresql -U kometio -d postgres -Atc 'select 1' 2>&1 | grep -qi 'permission denied'"
  docker rm -fv "$UPGRADE" >/dev/null
  docker volume rm "$UPGRADE_VOLUME" >/dev/null 2>&1 || true
fi

# --- moving the site ------------------------------------------------------------
#
# docs/adr/0105. The site above, with an uploaded file in it, is exported while
# the server runs; the archive is opened into a volume that has never been used
# (the server is not running there: a database is made again under it); and the
# result is started under another address. It has to be the same site with
# nothing to set up, and it must not be a way to keep what was only a moment.
step "moving the site: export, import into a new volume, start it elsewhere"
SITE_ID="$(curl -s -b "$COOKIES" "${API_URL}/sites/current" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)"
UPLOADED="$(curl -s -b "$COOKIES" -H "Origin: ${EDITOR_URL}" -F "siteId=${SITE_ID}" -F "file=@${WORK}/pixel.png;type=image/png" "${API_URL}/media" | grep -o '/uploads/[^"]*' | head -1)"
check "a file is uploaded to the site that will be exported" test -n "$UPLOADED"
check "the server exports its site while it runs" \
  sh -c "docker exec '$NAME' node /opt/kometio/cli.mjs export > '${WORK}/site.tar.gz'"
check "the archive is a .tar.gz with its manifest, its database and its uploads" \
  sh -c "tar tzf '${WORK}/site.tar.gz' | grep -q 'manifest.json' && tar tzf '${WORK}/site.tar.gz' | grep -q 'database.sql.gz' && tar tzf '${WORK}/site.tar.gz' | grep -q 'uploads/'"

# The backups (docs/adr/0119): the same archive, asked of the running server by
# the command that the daily one does, kept in a folder of the volume that is
# nobody else's, and opened like any other into a volume that has never been used.
step "backups: made by the server, private, and restorable"
backup_listing() { docker exec "$NAME" ls /data/backups; }
backup_is_named_as_an_export() {
  backup_listing | grep -Eq '^kometio-site-[0-9]{8}-[0-9]{4}\.tar\.gz$'
}
backup_folder_is_roots_alone() {
  [ "$(docker exec "$NAME" stat -c '%a %U' /data/backups)" = "700 root" ] \
    && ! docker exec -u kometio-site "$NAME" ls /data/backups
}
backup_leaves_no_half() {
  docker exec "$NAME" node /opt/kometio/cli.mjs backup \
    && ! docker exec "$NAME" ls -a /data/backups | grep -q '\.partial$'
}
check "the server says at its start that it backs itself up, and how" \
  sh -c "docker logs '$NAME' 2>&1 | grep -q 'backups: every 24 hours, keeping 7'"
check "a backup is made on request" \
  docker exec "$NAME" node /opt/kometio/cli.mjs backup
check "it is in /data/backups, under the name an export has" backup_is_named_as_an_export
check "the folder is root's alone: the site's user cannot even list it" backup_folder_is_roots_alone
BACKUP_FILE="$(backup_listing | grep -E '^kometio-site-' | tail -1)"
check "the backup is the archive: a .tar.gz with its manifest, its database and its uploads" \
  sh -c "docker exec '$NAME' cat '/data/backups/${BACKUP_FILE}' > '${WORK}/backup.tar.gz' && tar tzf '${WORK}/backup.tar.gz' | grep -q manifest.json && tar tzf '${WORK}/backup.tar.gz' | grep -q database.sql.gz && tar tzf '${WORK}/backup.tar.gz' | grep -q 'uploads/'"
check "it is opened into a new volume, as every archive is" \
  sh -c "docker run --rm -i -v '${BACKUP_VOLUME}:/data' '$IMAGE' import < '${WORK}/backup.tar.gz'"
check "and what was opened is a site: it exports again, with its manifest" \
  sh -c "docker run --rm -v '${BACKUP_VOLUME}:/data' '$IMAGE' export 2>/dev/null | tar tzf - | grep -q manifest.json"
check "a second backup, in the same minute, leaves no half of one behind" backup_leaves_no_half

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
  sh -c "test \"\$(docker exec '$NAME' sh -c 'ls /data/exports | grep -c ^export- || true')\" = 0"
docker exec "$NAME" rm -f /data/uploads/ballast.bin
# The API's user owns the uploads folder, so it can leave a link in it to a file
# that only root reads. The archive is read as that user (docs/adr/0109), who
# cannot read it either: the export is refused, and writes nothing of the file.
docker exec -u kometio "$NAME" ln -s /data/state/secrets.json /data/uploads/leak-link
if docker exec "$NAME" node /opt/kometio/cli.mjs export >"${WORK}/with-a-link.tar.gz" 2>/dev/null; then
  LINKED_EXPORT=made
else
  LINKED_EXPORT=refused
fi
check "an export with a link in the uploads folder to a file only root reads is refused" \
  test "$LINKED_EXPORT" = refused
check "and nothing of that file was written" \
  sh -c "! gzip -dc '${WORK}/with-a-link.tar.gz' 2>/dev/null | grep -aq postgresAppPassword"
docker exec "$NAME" rm -f /data/uploads/leak-link
check "with the link gone, the export is made again" \
  sh -c "docker exec '$NAME' node /opt/kometio/cli.mjs export 2>/dev/null | tar tzf - >/dev/null"
# The socket is the launcher's door, and only the API's user can open it: the user
# a theme's code runs as cannot even reach the folder it is in.
check "the API's own user can open the control socket (the control of the next check)" \
  docker exec -u kometio "$NAME" node -e "require('net').connect('/run/kometio/control.sock').on('connect', () => process.exit(0)).on('error', () => process.exit(1))"
check "the user a theme's code runs as cannot open it" \
  sh -c "! docker exec -u kometio-site '$NAME' node -e \"require('net').connect('/run/kometio/control.sock').on('connect', () => process.exit(0)).on('error', () => process.exit(1))\""
# The database's own socket trusts whoever opens it (there is no password to ask
# on a Unix socket in this cluster), so who may open it is what stands between a
# theme's code and the database's superuser, and the API and the site have the
# application role's password for TCP and need nothing more (docs/adr/0107).
check "root, which the launcher is, can open the database's socket (the control of the next checks)" \
  docker exec "$NAME" psql -h /run/postgresql -U postgres -d postgres -Atc 'select 1'
check "the user a theme's code runs as cannot: the socket is refused to it" \
  sh -c "docker exec -u kometio-site '$NAME' psql -h /run/postgresql -U kometio -d postgres -Atc 'select 1' 2>&1 | grep -qi 'permission denied'"
check "nor can the API's own user, whose database role is the application's and subject to row level security" \
  sh -c "docker exec -u kometio '$NAME' psql -h /run/postgresql -U kometio -d postgres -Atc 'select 1' 2>&1 | grep -qi 'permission denied'"
check "and the administrator's role has no way in over TCP without a password" \
  sh -c "! docker exec -u kometio-site '$NAME' psql -h 127.0.0.1 -U kometio -d postgres -w -Atc 'select 1'"
check "a file that is not an archive is refused, and nothing is started for it" \
  sh -c "! echo 'not an archive' | docker run --rm -i -v '${MOVED_VOLUME}:/data' '$IMAGE' import 2>/dev/null"
# The healthcheck used to ask the API only. A part that hangs (stopped here, as a
# process that is not answering is) must make the container unhealthy, and it must
# be well again when the part is.
step "the healthcheck sees a part that hangs"
check "all three parts answer, and the healthcheck says so" \
  docker exec "$NAME" node /opt/kometio/healthcheck.mjs
docker exec "$NAME" pkill -STOP nginx
check "with the editor's server stopped, it fails" \
  sh -c "! docker exec '$NAME' node /opt/kometio/healthcheck.mjs >/dev/null 2>&1"
check "and says which part: the editor" \
  sh -c "docker exec '$NAME' node /opt/kometio/healthcheck.mjs 2>&1 | grep -q 'not answering: the editor'"
docker exec "$NAME" pkill -CONT nginx
check "and with it running again, it says all is well" \
  docker exec "$NAME" node /opt/kometio/healthcheck.mjs
# An archive is somebody else's file. It must not get a shell as root through the
# SQL in it (psql's `\!` is run by whoever runs psql), nor a copy of a file of
# this machine through a hard link (docs/adr/0108). Both are made from the
# archive the server just exported, so that all else in them is as it should be.
step "an archive that somebody else made"
mkdir "${WORK}/hostile"
tar xzf "${WORK}/site.tar.gz" -C "${WORK}/hostile"
{
  printf '%s\n' '\! id -u > /data/postgres/who-ran-this'
  gunzip -c "${WORK}/hostile/database.sql.gz"
} | gzip >"${WORK}/hostile/database.sql.gz.new"
mv "${WORK}/hostile/database.sql.gz.new" "${WORK}/hostile/database.sql.gz"
tar czf "${WORK}/hostile.tar.gz" -C "${WORK}/hostile" .
check "an archive whose SQL runs a command is opened (the SQL is the site's, and is run)" \
  sh -c "docker run --rm -i -v '${HOSTILE_VOLUME}:/data' '$IMAGE' import < '${WORK}/hostile.tar.gz'"
check "and the command ran as the database's own user, not as root" \
  sh -c "test \"\$(docker run --rm -v '${HOSTILE_VOLUME}:/data' --entrypoint cat '$IMAGE' /data/postgres/who-ran-this)\" = 70"
python3 - "${WORK}/hostile" "${WORK}/linked.tar.gz" <<'PY'
import sys, tarfile
src, out = sys.argv[1], sys.argv[2]
with tarfile.open(out, "w:gz", format=tarfile.USTAR_FORMAT) as tf:
    tf.add(f"{src}/manifest.json", arcname="manifest.json")
    tf.add(f"{src}/database.sql.gz", arcname="database.sql.gz")
    folder = tarfile.TarInfo("uploads")
    folder.type, folder.mode = tarfile.DIRTYPE, 0o755
    tf.addfile(folder)
    link = tarfile.TarInfo("uploads/leak")
    link.type, link.mode = tarfile.LNKTYPE, 0o644
    link.linkname = "/data/state/secrets.json"
    tf.addfile(link)
PY
docker run --rm -v "${LINKED_VOLUME}:/data" --entrypoint sh "$IMAGE" -c 'mkdir -p /data/state && echo SECRET > /data/state/secrets.json' >/dev/null
check "an archive with a hard link to a file of this machine is refused" \
  sh -c "! docker run --rm -i -v '${LINKED_VOLUME}:/data' '$IMAGE' import < '${WORK}/linked.tar.gz' 2>/dev/null"
check "and no copy of that file was made among the uploads" \
  docker run --rm -v "${LINKED_VOLUME}:/data" --entrypoint sh "$IMAGE" -c 'test ! -e /data/uploads/leak'
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
  -v "${MOVED_VOLUME}:/data" \
  "$IMAGE" >/dev/null
wait_for_banners 1 "$MOVED" >/dev/null
MOVED_API_URL="http://localhost:${MOVED_API_PORT}/api"
check "the moved site is already set up: no wizard" sh -c "curl -s '${MOVED_API_URL}/setup/status' | grep -q '\"hasBeenSetUp\":true'"
check "and it asks for no setup token" test -z "$(setup_token "$MOVED")"
# The account is what is being proved here, and a busy minute can refuse a
# request for a reason that has nothing to do with it, so a refusal is asked
# again, with a captcha of its own: a solved one is spent by the attempt.
LOGIN_CODE=000
for attempt in 1 2 3; do
  LOGIN_CODE="$(status_code -H 'content-type: application/json' -H "Origin: http://localhost:${MOVED_EDITOR_PORT}" \
    -d "$(login_body "$MOVED_API_URL" "$ADMIN_PASSWORD")" "${MOVED_API_URL}/auth/login")"
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

# --- opening the site from the first-run screen -----------------------------------
#
# docs/adr/0106. The archive the editor gave (above) is handed to a NEW installation
# on its first-run screen, in a browser: the API that takes it is stopped to open it,
# and started again, and so is the site, while the container keeps running. It has to
# come out the same site, with its account and its file, and nothing about what was
# refused on the way may have touched the installation.
step "opening the site from the first-run screen, in a browser"
IMPORTED_EDITOR_URL="http://localhost:${IMPORTED_EDITOR_PORT}"
IMPORTED_API_URL="http://localhost:${IMPORTED_API_PORT}/api"
IMPORTED_SITE_URL="http://localhost:${IMPORTED_SITE_PORT}"
docker run -d --name "$IMPORTED" \
  -p "${IMPORTED_EDITOR_PORT}:80" -p "${IMPORTED_API_PORT}:3000" -p "${IMPORTED_SITE_PORT}:4322" \
  -e "EDITOR_APP_URL=${IMPORTED_EDITOR_URL}" \
  -e "API_PUBLIC_URL=${IMPORTED_API_URL}" \
  -e "PUBLIC_SITE_URL=${IMPORTED_SITE_URL}" \
  -v "${IMPORTED_VOLUME}:/data" \
  "$IMAGE" >/dev/null
wait_for_banners 1 "$IMPORTED" >/dev/null
IMPORTED_TOKEN="$(setup_token "$IMPORTED")"
IMPORTED_STARTED="$(docker inspect -f '{{.State.StartedAt}}' "$IMPORTED")"
check "the server says it can open an archive" \
  sh -c "curl -s '${IMPORTED_API_URL}/deployment' | grep -q '\"siteArchive\":true'"
check "a file that is not an archive is refused with its reason (400), before anything is stopped" \
  sh -c "test \"\$(curl -s -o '${WORK}/refusal.json' -w '%{http_code}' -H 'content-type: application/gzip' -H 'X-Setup-Token: ${IMPORTED_TOKEN}' --data-binary 'not an archive' '${IMPORTED_API_URL}/setup/import')\" = 400 && grep -q 'not a Kometio site archive' '${WORK}/refusal.json'"
check "a wrong setup token is refused (401), and no token either" \
  sh -c "test \"\$(curl -s -o /dev/null -w '%{http_code}' -H 'content-type: application/gzip' -H 'X-Setup-Token: a-guess' --data-binary 'x' '${IMPORTED_API_URL}/setup/import')\" = 401"
check "the installation is as it was: still new, its API still the one that was started" \
  sh -c "curl -s '${IMPORTED_API_URL}/setup/status' | grep -q '\"hasBeenSetUp\":false'"
if [ "$SMOKE_ONLY" = false ]; then
  if (
    cd "$(git rev-parse --show-toplevel)"
    E2E_SETUP_TOKEN="$IMPORTED_TOKEN" E2E_ARCHIVE="${WORK}/site-from-editor.tar.gz" \
      E2E_SITE_NAME="Check Site" E2E_UPLOADED_PATH="$UPLOADED" \
      VITE_API_URL="$IMPORTED_API_URL" EDITOR_APP_URL="$IMPORTED_EDITOR_URL" VITE_PUBLIC_SITE_URL="$IMPORTED_SITE_URL" \
      DEFAULT_USER_EMAIL="$ADMIN_EMAIL" DEFAULT_USER_PASSWORD="$ADMIN_PASSWORD" \
      pnpm exec nx run @kometio/e2e:import
  ); then
    pass "a site from another installation is opened on the first-run screen, and its account signs in"
  else
    fail "opening a site from the first-run screen in a browser failed"
  fi
else
  # The same, with no browser: what the page does is a POST and then a wait.
  CODE="$(status_code -H 'content-type: application/gzip' -H "X-Setup-Token: ${IMPORTED_TOKEN}" \
    --data-binary "@${WORK}/site-from-editor.tar.gz" "${IMPORTED_API_URL}/setup/import")"
  if [ "$CODE" = 202 ]; then pass "the archive is accepted (202)"; else fail "the archive was answered ${CODE}, not 202"; fi
  waited=0
  until curl -sf "${IMPORTED_API_URL}/setup/status" 2>/dev/null | grep -q '"hasBeenSetUp":true'; do
    waited=$((waited + 2))
    if [ "$waited" -gt 180 ]; then break; fi
    sleep 2
  done
  check "the server comes back with the site that was in the archive" \
    sh -c "curl -sf '${IMPORTED_API_URL}/setup/status' | grep -q '\"hasBeenSetUp\":true'"
  # The API is back before the site is: after an import the launcher starts the
  # API and waits for it, then starts the site and waits for that, and only then
  # prints the banner again. "Set up" from the API does not say the site is
  # there; the second banner does (the same lesson as the first start's, where
  # the health check comes before the editor).
  wait_for_banners 2 "$IMPORTED" >/dev/null
  LOGIN_CODE=000
  for attempt in 1 2 3; do
    LOGIN_CODE="$(status_code -H 'content-type: application/json' -H "Origin: ${IMPORTED_EDITOR_URL}" \
      -d "$(login_body "$IMPORTED_API_URL" "$ADMIN_PASSWORD")" "${IMPORTED_API_URL}/auth/login")"
    [ "$LOGIN_CODE" = 200 ] && break
    [ "$attempt" -lt 3 ] && sleep 3
  done
  if [ "$LOGIN_CODE" = 200 ]; then
    pass "the account that was in the archive signs in"
  else
    fail "the account that was in the archive signs in (the login answered ${LOGIN_CODE})"
  fi
  check "the site that was in it is served at this installation's address" \
    sh -c "curl -sL '${IMPORTED_SITE_URL}/' | grep -q '<title>Check Site'"
  check "its uploaded file came with it" test "$(status_code "${IMPORTED_API_URL}${UPLOADED}")" = 200
fi
check "the container was not restarted: it is the same one, started once" \
  test "$(docker inspect -f '{{.State.StartedAt}} {{.RestartCount}}' "$IMPORTED")" = "${IMPORTED_STARTED} 0"
check "the server says it opened the site, in its log" \
  sh -c "docker logs '$IMPORTED' 2>&1 | grep -q 'the site \"Check Site\" is here'"
check "an installation with a site opens no other: the setup token is spent (401)" \
  test "$(status_code -H 'content-type: application/gzip' -H "X-Setup-Token: ${IMPORTED_TOKEN}" --data-binary 'x' "${IMPORTED_API_URL}/setup/import")" = 401
check "and the control socket's result file says nothing of a failure" \
  sh -c "! docker exec '$IMPORTED' grep -q '\"ok\":false' /run/kometio/import-result.json"
docker rm -fv "$IMPORTED" >/dev/null
docker volume rm "$IMPORTED_VOLUME" >/dev/null 2>&1 || true

# --- a log a collector can read ---------------------------------------------------

# With KOMETIO_LOG_FORMAT=json, every line the container writes is one JSON
# object, so that a collector never meets one it cannot parse; and with
# KOMETIO_ACCESS_LOG=true a request is a line of the API's. The text format, which
# is what every scenario above read, is the default and is not touched.
step "the log as JSON, for a collector (docs/adr/0122)"
docker run -d --name "$LOGJSON" \
  -p "${LOGJSON_API_PORT}:3000" \
  -e KOMETIO_LOG_FORMAT=json -e KOMETIO_ACCESS_LOG=true \
  -e "API_PUBLIC_URL=http://localhost:${LOGJSON_API_PORT}/api" \
  -v "${LOGJSON_VOLUME}:/data" "$IMAGE" >/dev/null
wait_for_banners 1 "$LOGJSON" >/dev/null
LOGJSON_REQUEST_ID="check-json-log-$(openssl rand -hex 4)"
LOGJSON_QUERY_SECRET="query-secret-$(openssl rand -hex 8)"
curl -s -o /dev/null -H "X-Request-Id: ${LOGJSON_REQUEST_ID}" \
  "http://localhost:${LOGJSON_API_PORT}/api/does-not-exist?token=${LOGJSON_QUERY_SECRET}"
# The access line is written when the response has gone: a moment, not none.
sleep 1
while IFS= read -r answer; do
  case "$answer" in
    ok:*) pass "${answer#ok: }" ;;
    *) fail "${answer#FAIL: }" ;;
  esac
done < <(docker logs "$LOGJSON" 2>&1 | node "$(git rev-parse --show-toplevel)/docker/kometio/json-log-check.mjs" "$LOGJSON_REQUEST_ID" "$LOGJSON_QUERY_SECRET" || true)
docker rm -fv "$LOGJSON" >/dev/null

# --- what the proxy writes of a request ---------------------------------------------
#
# docs/adr/0126. A server with a name has Caddy in front of the three parts. Its
# own access line carries what a request did but the credentials it redacts: every
# other header, the address, the query. And the line for a name that has no site
# (the machine's address, the redirect from port 80) goes to a log that no site's
# filter sees.
# Two runs on the same volume: without KOMETIO_ACCESS_LOG there is no line of a
# request and nothing a request carried; with it there is a line for each, and
# the container's whole log is searched for what they carried.
step "the proxy's access log: nothing unless asked, and then none of what a request carried (docs/adr/0126)"
PROXYLOG_SECRET="proxy-secret-$(openssl rand -hex 8)"
PROXYLOG_HOST="api.${PROXYLOG_DOMAIN}:${PROXYLOG_HTTPS_PORT}"

# One container, started with the arguments after the first, asked what a
# request carrying a secret in every place has: through the name that has a site,
# over HTTP to the address (no site at all), and to a name over HTTP (the
# redirect). `--resolve` and not DNS: the name only has to reach this machine,
# and Caddy's certificate for it is its own authority's (-k).
proxylog_run() {
  docker run -d --name "$PROXYLOG" \
    -p "${PROXYLOG_HTTP_PORT}:80" -p "${PROXYLOG_HTTPS_PORT}:443" \
    -e "DOMAIN=${PROXYLOG_DOMAIN}" \
    -e "EDITOR_APP_URL=https://admin.${PROXYLOG_DOMAIN}:${PROXYLOG_HTTPS_PORT}" \
    -e "API_PUBLIC_URL=https://${PROXYLOG_HOST}/api" \
    -e "PUBLIC_SITE_URL=https://${PROXYLOG_DOMAIN}:${PROXYLOG_HTTPS_PORT}" \
    -v "${PROXYLOG_VOLUME}:/data" "$@" "$IMAGE" >/dev/null
  wait_for_banners 1 "$PROXYLOG" >/dev/null
  curl -sk -o /dev/null \
    --resolve "${PROXYLOG_HOST}:127.0.0.1" \
    -H "Cookie: session=${PROXYLOG_SECRET}-cookie" \
    -H "Authorization: Bearer ${PROXYLOG_SECRET}-bearer" \
    -H "X-Preview-Token: ${PROXYLOG_SECRET}-header" \
    -H "Referer: https://elsewhere.test/page?t=${PROXYLOG_SECRET}-referer" \
    -A "Browser/${PROXYLOG_SECRET}-agent" \
    "https://${PROXYLOG_HOST}/api/proxy-log-check?token=${PROXYLOG_SECRET}-query"
  curl -s -o /dev/null \
    -H "Cookie: session=${PROXYLOG_SECRET}-cookie" \
    -A "Browser/${PROXYLOG_SECRET}-agent" \
    "http://127.0.0.1:${PROXYLOG_HTTP_PORT}/no-site-here?token=${PROXYLOG_SECRET}-query"
  # The line is written when the response has gone: a moment, not none.
  sleep 1
}
proxy_lines() { docker logs "$PROXYLOG" 2>&1 | grep 'http.log.access' || true; }

proxylog_run
check "without the variable the proxy writes no line of a request" \
  test "$(proxy_lines | grep -c .)" = 0
check "and nothing a request carried is anywhere in the log" \
  sh -c "! docker logs '$PROXYLOG' 2>&1 | grep -q '${PROXYLOG_SECRET}'"
docker rm -fv "$PROXYLOG" >/dev/null

proxylog_run -e KOMETIO_ACCESS_LOG=true
check "with it, the proxy wrote a line for the request: its host, its path and its status" \
  sh -c "docker logs '$PROXYLOG' 2>&1 | grep 'http.log.access' | grep '\"host\":\"${PROXYLOG_HOST}\"' | grep '\"uri\":\"/api/proxy-log-check\"' | grep -q '\"status\":404'"
check "its line has what a log of requests is asked: duration and size" \
  sh -c "docker logs '$PROXYLOG' 2>&1 | grep 'http.log.access' | grep -q '\"duration\":.*\"size\":'"
check "a request to an address that has no site is a line too (the default logger's)" \
  sh -c "docker logs '$PROXYLOG' 2>&1 | grep 'http.log.access' | grep -q '\"uri\":\"/no-site-here\"'"
check "no cookie, no token, no header of its own, no referer, no browser, no query: none of the six secrets is anywhere in the log" \
  sh -c "! docker logs '$PROXYLOG' 2>&1 | grep -q '${PROXYLOG_SECRET}'"
check "and no line of the proxy's has an address, a port, a header or a response header" \
  sh -c "! docker logs '$PROXYLOG' 2>&1 | grep 'http.log.access' | grep -Eq 'remote_ip|client_ip|remote_port|\"headers\"|resp_headers'"
docker rm -fv "$PROXYLOG" >/dev/null

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
