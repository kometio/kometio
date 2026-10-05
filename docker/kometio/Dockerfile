# syntax=docker/dockerfile:1
#
# Kometio in ONE image: Postgres, the API, the public site and the editor,
# started by `launcher.mjs`, with everything that has to survive a restart in
# a single volume, /data.
#
# It assembles; it does not rebuild. The API, the public site and the editor
# each have their own Dockerfile and their own published image, and this
# one takes the finished artefacts out of those images (`COPY --from`), so
# there is still exactly one place that says how each app is built. The three
# images are named by build arguments: the published ones by default, local
# tags when building on a developer machine (see README.md in this folder).
#
# The base is the same `node:24-alpine` the three of them run on, which is
# what keeps their native modules (sharp, argon2: built for musl) working.

ARG API_IMAGE=ghcr.io/kometio/kometio-api:main
ARG PUBLIC_SITE_IMAGE=ghcr.io/kometio/kometio-public-site:main
ARG EDITOR_IMAGE=ghcr.io/kometio/kometio-editor-app:main

FROM ${API_IMAGE} AS api
FROM ${PUBLIC_SITE_IMAGE} AS public-site
FROM ${EDITOR_IMAGE} AS editor

FROM node:24-alpine AS runtime
# postgresql16-contrib: the same extension set the official postgres:16 image
# carries, so a database restored from a stack that ran on that one opens here.
#
# caddy is the proxy of a server (DOMAIN set; docs/adr/0104): ports 80 and 443
# and the certificates. A trial does not start it. It runs as its own user, which
# may bind a port below 1024 only if the binary is given that one capability
# (setcap's package is only needed for this line, and goes again).
RUN apk add --no-cache postgresql16 postgresql16-contrib nginx tini caddy libcap-utils \
 && setcap cap_net_bind_service=+ep /usr/sbin/caddy \
 && apk del libcap-utils

# One user per half, so that the public site (which can run code from a theme)
# cannot read the API's files, and neither of them the database's.
RUN addgroup -S kometio && adduser -S kometio -G kometio \
 && addgroup -S kometio-site && adduser -S kometio-site -G kometio-site

COPY --from=api /app /opt/api
COPY --from=public-site /app /opt/site
# The editor, laid out as in its own image, so that its nginx template and
# its runtime-config script (docs/adr/0076) run here unchanged: the Content
# Security Policy and /config.js are defined in one place only.
COPY --from=editor /usr/share/nginx/html /usr/share/nginx/html
COPY --from=editor /etc/nginx/templates/default.conf.template /opt/kometio/editor.conf.template
COPY --from=editor /docker-entrypoint.d/10-kometio-runtime-config.envsh /opt/kometio/editor-runtime-config.envsh

# The migrations are not copied here: they are already inside the API
# artefact, so they are always those of the version of the code that starts.
COPY docker/kometio/launcher.mjs docker/kometio/server-mode.mjs docker/kometio/migrate.mjs docker/kometio/nginx.conf /opt/kometio/
# The compose stack's own Caddyfile, so that the security headers and the
# compression are defined once; the launcher tells it where each half is.
COPY Caddyfile /opt/kometio/Caddyfile

VOLUME /data
# A trial: 3000 the API, 4322 the public site, 80 the editor (nginx). A server
# (DOMAIN set): 80 and 443 only, which is Caddy; the three above are then inside.
EXPOSE 3000 4322 80 443

# `127.0.0.1`, not `localhost`: the latter resolves ::1 first here, and the
# API's own server only answers on IPv4.
HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=6 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

# tini is PID 1 (reaps what the launcher's children leave behind); the
# launcher decides what runs, in which order, and stops it all in reverse.
ENTRYPOINT ["/sbin/tini", "--", "node", "/opt/kometio/launcher.mjs"]
