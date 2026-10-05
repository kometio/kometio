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
# It uses names and ports of its own (`kometio-check*`, 15200/15000/15322, and
# Mailpit on 11025/18025), so it can run next to your development stack, and it
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
EDITOR_PORT=15200
API_PORT=15000
SITE_PORT=15322
SMTP_PORT=11025
MAILPIT_PORT=18025
EDITOR_URL="http://localhost:${EDITOR_PORT}"
API_URL="http://localhost:${API_PORT}/api"
SITE_URL="http://localhost:${SITE_PORT}"
# Cloudflare's published test key: the pair of the secret the image uses in a trial.
TURNSTILE_TEST_SITE_KEY=1x00000000000000000000AA

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
    if docker ps -a --format '{{.Names}}' | grep -qx "$FIRST"; then
      printf '\n== the last lines of the first-run image log\n'
      docker logs --tail 40 "$FIRST" 2>&1 || true
    fi
  fi
  docker rm -fv "$NAME" "$MAILPIT" "$FIRST" >/dev/null 2>&1 || true
  # Only the volumes this script made: the checks below guarantee they did not exist.
  docker volume rm "$VOLUME" "$FIRST_VOLUME" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}

# --- before anything is started -------------------------------------------------
#
# These come BEFORE the trap that cleans up: stopping here because a name is
# taken must not remove the thing that holds it.

for taken in "$NAME" "$MAILPIT" "$FIRST"; do
  if docker ps -a --format '{{.Names}}' | grep -qx "$taken"; then
    echo "A container named $taken already exists: remove it first (this script removes what it creates, and would remove that too)." >&2
    exit 2
  fi
done
for taken in "$VOLUME" "$FIRST_VOLUME"; do
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

# --- the first run, in a browser ------------------------------------------------
#
# On an installation of its own, started the way the quickstart says: no captcha
# key, no mail server, and an address only because this machine's default ports
# may be taken. The main installation below is given a captcha key and a mail
# server so that the rest of the suite can use them, and that hides what a person
# meets first (docs/adr/0101): a login button that stayed disabled for lack of a
# key, a login left on the host by another installation, a site "not found".
if [ "$SMOKE_ONLY" = false ]; then
  step "the first run, in a browser, as the image is delivered"
  FIRST_EDITOR_URL="http://localhost:${FIRST_EDITOR_PORT}"
  FIRST_API_URL="http://localhost:${FIRST_API_PORT}/api"
  FIRST_SITE_URL="http://localhost:${FIRST_SITE_PORT}"
  docker run -d --name "$FIRST" \
    -p "${FIRST_EDITOR_PORT}:80" -p "${FIRST_API_PORT}:3000" -p "${FIRST_SITE_PORT}:4322" \
    -e "EDITOR_APP_URL=${FIRST_EDITOR_URL}" \
    -e "API_PUBLIC_URL=${FIRST_API_URL}" \
    -e "PUBLIC_SITE_URL=${FIRST_SITE_URL}" \
    -v "${FIRST_VOLUME}:/data" \
    "$IMAGE" >/dev/null
  wait_for_banners 1 "$FIRST" >/dev/null
  if (
    cd "$(git rev-parse --show-toplevel)"
    E2E_SETUP_TOKEN="$(setup_token "$FIRST")" \
      VITE_API_URL="$FIRST_API_URL" EDITOR_APP_URL="$FIRST_EDITOR_URL" VITE_PUBLIC_SITE_URL="$FIRST_SITE_URL" \
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
  first_log="$(docker logs "$FIRST" 2>&1 || true)"
  check "an invitation with no mail server is written to the log" \
    grep -q "To:      ${INVITEE_EMAIL}" <<<"$first_log"
  check "the logged invitation carries its link" \
    grep -q "${FIRST_EDITOR_URL}/accept-invite?inviteToken=" <<<"$first_log"
  docker rm -fv "$FIRST" >/dev/null
  docker volume rm "$FIRST_VOLUME" >/dev/null 2>&1 || true
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
  -e "TURNSTILE_SITE_KEY=${TURNSTILE_TEST_SITE_KEY}" \
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
