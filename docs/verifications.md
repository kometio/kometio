# What has been measured, and how to repeat it

Facts about how Kometio behaves that no test pins and that a person running it
would want to know, with the date they were true and the commands. They are
measurements, not promises: the day something here stops being true is the day
to read it again and write the new date under it.

## 2026-10-14

Against the published `ghcr.io/kometio/kometio:main` image, on a laptop.

### The proxy does not believe a visitor's `X-Forwarded-For` (VER-1)

Every limit per visitor (five logins a minute, forms, AI generation) keys on the
address the API is told. In server mode the image's own Caddy tells it. If
Caddy passed on what a visitor wrote, one person could be a thousand.

```sh
docker run -d --name kometio-ver -e DOMAIN=ver.localhost -e ACME_EMAIL=ops@example.test \
  -p 127.0.0.1:18080:80 -p 127.0.0.1:18443:443 -v kometio-ver-data:/data \
  ghcr.io/kometio/kometio:main
# eight attempts, each claiming to be somebody else:
for i in 1 2 3 4 5 6 7 8; do
  curl -sk -o /dev/null -w "attempt $i -> %{http_code}\n" \
    --resolve api.ver.localhost:18443:127.0.0.1 -H "X-Forwarded-For: 203.0.113.$i" \
    -H "Content-Type: application/json" -H "Origin: https://admin.ver.localhost" \
    -X POST https://api.ver.localhost:18443/api/auth/login \
    -d '{"email":"nobody@example.test","password":"x","captchaToken":"x"}'
done
```

**Result:** the sixth attempt is answered 429, exactly as with no header at all.
The header a client writes is replaced by the address Caddy saw.

**Not covered:** a CDN in front of Caddy (Cloudflare). The documented setting is
`TRUSTED_PROXY_HOPS=2` for that (docs/self-hosting.md); it has not been run
behind one.

### A container that is killed, and one that is stopped (VER-3)

Idle, with a row committed just before:

| What                                                | Result                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `docker kill -s KILL` (exit code)                   | 137                                                                                               |
| `docker start`, until the container reports healthy | 12 s                                                                                              |
| What Postgres says                                  | `database system was not properly shut down; automatic recovery in progress`, redo done in 0.01 s |
| Rows committed before the kill                      | both there                                                                                        |
| `docker stop`                                       | 0.6 s, exit code 0, every part shut down in order                                                 |

**Not covered:** a kill while the site is writing, and a loss of power to the
machine (which a container kill is not). The README's `--stop-timeout 30` is
what covers a stop that has a lot to finish.

### The CI's own numbers (VER-4)

The last 198 runs of each workflow, 11–14 October 2026 (a week of unusually
many pull requests).

|                                | Runs | Succeeded |   Median | 90th percentile |
| ------------------------------ | ---: | --------: | -------: | --------------: |
| CI, pull requests              |  125 |      90 % | 11.1 min |        12.7 min |
| CI, pushes to `main`           |   73 |      95 % | 11.3 min |        13.2 min |
| Docker build, pull requests    |  101 |      97 % | 14.7 min |        17.0 min |
| Docker build, pushes to `main` |   48 |      97 % |  8.9 min |        15.8 min |

No commit had both a red run and a green one, so there is no sign in this
window of a test that passes on a retry: a red was followed by a new commit, not
by a second attempt.
The Docker build cancels a run when a newer push replaces it (49 of the 198),
which is why its conclusions are not all `success` or `failure`.

```sh
gh run list --workflow ci.yml --limit 200 \
  --json conclusion,event,headSha,createdAt,updatedAt,attempt
```

### A real database, through the product's own export and import (VER-5)

The development database's own `pg_dump` (57 page groups, 113 translations, 23
users, 19 media rows, a database that went through the squash of ADR-0004) was
restored into a container of the published image, exported with
`cli.mjs export`, and opened with `import` into an empty volume.

**Result:** it was refused, as "made by a newer Kometio": the 21 migrations that
the baseline replaced were counted as a newer version's. With the fix of the same
day the export works, the new volume starts (`migrations are up to date`), and
page groups, translations, users, media and forms are 57, 113, 23, 19 and 1 on
both sides; the sessions and form submissions are left behind, as designed.

**Not covered:** the uploaded files. The development database's media rows point
at files in the folder `uploads/` of the machine, which a dump does not carry;
a site that moves needs that folder in the volume.
