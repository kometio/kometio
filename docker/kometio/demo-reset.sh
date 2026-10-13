#!/bin/sh
# Makes a public demo again from its seed (docs/adr/0118).
#
# A demo is a Kometio started with KOMETIO_DEMO=true on a volume that was made
# by importing a seed: the export of a site prepared on a private installation.
# Resetting it is doing that again, on a volume that has never been used —
# which is the only kind an archive opens into — so everything the visitors did
# since is gone, and what they find is the seed.
#
#   KOMETIO_IMAGE=ghcr.io/kometio/kometio:0.1.0-beta.1 \
#   SEED=/srv/kometio/demo-seed.tar.gz \
#   DOMAIN=demo.example.com \
#   sh demo-reset.sh -p 80:80 -p 443:443 -p 443:443/udp
#
# Everything after the script's name is given to `docker run` for the demo:
# the ports, mostly. The address it is reached at is the same one would give to
# `docker run` of a server: `DOMAIN`, or nothing for `localhost`.
#
# It takes a minute or two, during which there is no demo, and it removes the
# one that is running before it opens the seed: try a new seed once by hand
# (the `import` below, into a volume you then throw away) before it is the one
# cron uses. Run it from cron at the hour the fewest people are looking.
set -eu

IMAGE="${KOMETIO_IMAGE:?Set KOMETIO_IMAGE to the image to run, with its tag}"
SEED="${SEED:?Set SEED to the seed archive (the export of a prepared site)}"
NAME="${NAME:-kometio-demo}"
VOLUME="${VOLUME:-kometio-demo-data}"

if [ ! -s "$SEED" ]; then
  echo "demo-reset: the seed '$SEED' is not there, or is empty; nothing was changed" >&2
  exit 1
fi

docker rm -fv "$NAME" >/dev/null 2>&1 || true
docker volume rm "$VOLUME" >/dev/null 2>&1 || true
docker volume create "$VOLUME" >/dev/null

docker run --rm -i -v "$VOLUME:/data" ${DOMAIN:+-e "DOMAIN=$DOMAIN"} \
  "$IMAGE" import < "$SEED"

docker run -d --name "$NAME" --restart unless-stopped \
  --stop-timeout 30 --log-opt max-size=10m --log-opt max-file=5 \
  -v "$VOLUME:/data" \
  -e KOMETIO_DEMO=true ${DOMAIN:+-e "DOMAIN=$DOMAIN"} \
  "$@" "$IMAGE" >/dev/null
echo "demo-reset: $NAME is starting from $SEED"
