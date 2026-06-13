# Deploying Natter (+ optional usage tracking in Grafana)

A Docker-based self-hosting guide. It assumes a Linux host where you already run
a **reverse proxy** (nginx in these examples) and — for the optional usage
dashboard — a **Loki + Promtail + Grafana** stack, all attached to a shared
external Docker network called `web` (create it once with
`docker network create web`).

Throughout, `<your-host>` is an SSH target (e.g. an alias in `~/.ssh/config`),
`<your-server-ip>` is its public IP, and `natter.cc` is used as the example
domain — substitute your own. Promtail auto-collects every container's stdout,
so once Natter runs as a container and logs JSON usage lines, they land in Loki
with no Promtail/Loki changes.

Deploy in two stages so the tracking pipeline is proven before anything is public:

- **Stage A** — run the container + load the dashboard; verify usage → Loki → Grafana.
- **Stage B** — expose at your domain (origin cert + nginx vhost + DNS).

---

## Stage A — container + dashboard (no cert/DNS needed)

### A1. Get the code onto the server

Put the repo at `/srv/natter` (any path works). Either:

```bash
# Option A (reproducible): clone from your remote
git clone <remote-url> /srv/natter

# Option B (from this machine): rsync the working tree (includes any
# uncommitted local work). Run from the repo root:
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git \
  ./ <your-host>:/srv/natter/
```

### A2. Provide runtime env

`.env.local` is gitignored — copy it onto the server (never baked into the image):

```bash
scp .env.local <your-host>:/srv/natter/.env.local
```

Required: `TMDB_KEY`, `MINIMAX_API_KEY` (the agent). Optional: `MINIMAX_MODEL`
(default `MiniMax-M2`), `MINIMAX_BASE_URL`, `GROQ_API_KEY` (transcription; falls
back to `OPENAI_API_KEY`), `BRAVE_SEARCH_API_KEY`. If you want the private
feedback admin, also set `NATTER_ADMIN_USER`, `NATTER_ADMIN_PASSWORD`, and
optionally `NATTER_AGENT_TOKEN` for periodic review agents. See `.env.example`.

### A3. Build + run the container

```bash
ssh <your-host> 'cd /srv/natter && docker compose up -d --build'
ssh <your-host> 'docker ps --filter name=natter --format "{{.Names}} {{.Status}} {{.Ports}}"'
```

Compose binds `127.0.0.1:3002:3000` and joins the external `web` network, so
your reverse proxy can later reach it as `http://natter:3000`.

### A4. Install the Grafana dashboard (optional usage tracking)

If you run the shared Loki/Promtail/Grafana stack, drop the dashboard into your
Grafana's provisioning directory:

```bash
scp deploy/grafana/natter-usage.json \
  <your-host>:/srv/infra/grafana/provisioning/dashboards/natter-usage.json
```

Grafana auto-loads it within ~30s (dashboard "Natter — Usage"). No restart needed.

### A5. Verify the pipeline end-to-end

Hit the container directly with simulated Cloudflare headers and confirm the
line reaches Loki:

```bash
# generate one search event
ssh <your-host> 'curl -s -X POST http://127.0.0.1:3002/api/recommend \
  -H "Content-Type: application/json" \
  -H "CF-Connecting-IP: 203.0.113.9" -H "CF-IPCountry: GB" \
  -d "{\"query\":\"deploy smoke test\",\"kind\":\"all\"}" -o /dev/null -w "%{http_code}\n"'

# confirm Promtail shipped it to Loki. If Loki is NOT host-published, query it
# from a throwaway curl container on the shared `web` network:
ssh <your-host> 'NOW=$(date +%s); docker run --rm --network web curlimages/curl:latest \
  -s -G "http://loki:3100/loki/api/v1/query_range" \
  --data-urlencode "query={container_name=\"natter\"} | json | evt=\"usage\"" \
  --data-urlencode "start=$((NOW-300))000000000" --data-urlencode "end=${NOW}000000000" \
  | head -c 400; echo'
```

Then open Grafana → **Natter — Usage**: the smoke-test query appears in
*Top search queries* and *Live search feed*.

If feedback admin env vars are configured, verify private feedback collection:

```bash
# public feedback submit
ssh <your-host> 'curl -s -X POST http://127.0.0.1:3002/api/feedback \
  -H "Content-Type: application/json" \
  -H "CF-Connecting-IP: 203.0.113.10" -H "CF-IPCountry: GB" \
  -d "{\"message\":\"deploy smoke feedback\",\"category\":\"idea\",\"page\":\"/\"}"'

# admin/agent queue read, using values already present in /srv/natter/.env.local
ssh <your-host> 'cd /srv/natter &&
  set -a && . ./.env.local && set +a &&
  curl -s -u "$NATTER_ADMIN_USER:$NATTER_ADMIN_PASSWORD" \
    http://127.0.0.1:3002/api/admin/feedback?limit=5 | head -c 500; echo'
```

> **Datasource uid gotcha.** The dashboard references the Loki datasource by
> `uid: Loki`. If your provisioned datasource has no explicit uid (Grafana
> auto-generates one), that reference resolves to "Data source not found". Fix
> by adding `uid: Loki` to your `provisioning/datasources/loki.yaml` and
> restarting the Grafana container.

---

## Stage B — expose at your domain

This example uses Cloudflare in front (proxied A records → `<your-server-ip>`,
zone SSL mode **Full**).

### B1. Origin certificate (self-signed — Full mode doesn't validate it)

In **Full** mode Cloudflare encrypts edge↔origin but doesn't validate the origin
cert, so a self-signed cert suffices:

```bash
ssh <your-host> 'cd /srv/infra/nginx/certs &&
  openssl req -x509 -nodes -newkey rsa:2048 -keyout natter.key -out natter.crt -days 3650 \
    -subj "/O=Natter/CN=natter.cc" \
    -addext "subjectAltName=DNS:natter.cc,DNS:*.natter.cc" && chmod 600 natter.key'
```

> Using **Full (strict)**? Replace this with a real Cloudflare **Origin
> Certificate** (SSL/TLS → Origin Server) at the same paths.

### B2. nginx vhost — restart, don't just reload

If your nginx container bind-mounts its config as a **single file** and that
file's inode changes (atomic-save edits, `sed -i`), the container keeps seeing
the OLD inode and `nginx -s reload` applies **stale** config. So: append →
validate the real file in a throwaway nginx → **restart** the container. (Adjust
`<proxy-container>` and paths to your setup; `deploy/nginx/natter.conf` is the
server block to append.)

```bash
# append (idempotent) with a one-time backup
ssh <your-host> 'cd /srv/infra/nginx &&
  [ -f nginx.conf.prenatter ] || cp nginx.conf nginx.conf.prenatter &&
  grep -q "server_name natter.cc" nginx.conf ||
    cat /srv/natter/deploy/nginx/natter.conf >> nginx.conf'

# validate the CURRENT host file (block + certs) — it fronts EVERY site, so a
# syntax error would take them all down on restart
ssh <your-host> 'docker run --rm \
  -v /srv/infra/nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  -v /srv/infra/nginx/certs:/etc/nginx/certs:ro nginx:alpine nginx -t'

# restart so it re-binds to the current file (brief reload for all sites)
ssh <your-host> 'docker restart <proxy-container> &&
  docker exec <proxy-container> nginx -T 2>/dev/null | grep -c "server_name natter.cc"'   # -> 1
```

### B3. DNS

Create proxied A records `natter.cc` + `www` → `<your-server-ip>` at your DNS
provider.

### B4. Verify public

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://natter.cc/api/title \
  -H 'Content-Type: application/json' -d '{}'      # 422 = Natter (not 404 static)
```

Run a real search at https://natter.cc; its usage line lands in Loki with the
real client country/IP, and the dashboard updates.

---

## Redeploy (after code changes)

```bash
rsync -az --delete --exclude node_modules --exclude .next --exclude .git \
  ./ <your-host>:/srv/natter/
ssh <your-host> 'cd /srv/natter && docker compose up -d --build'
```

Dashboard changes: re-`scp` `natter-usage.json` (auto-reloads).

Feedback admin after deploy:

- Human review page: `https://natter.cc/admin/feedback`
- Agent queue API: `GET /api/admin/feedback?status=new&limit=50`
- Agent update API: `PATCH /api/admin/feedback/<id>`

Use HTTP Basic auth for the human page and `Authorization: Bearer
$NATTER_AGENT_TOKEN` for agents. Keep both secrets in `.env.local` or your
server environment, never in git.

## Privacy / retention

Usage lines contain the full search query, a short client IP hash, and country.
Feedback usage lines include category/status only, not full messages or contact
details. They live in Loki under your stack's retention policy. To change how
long data is kept, adjust your Loki retention config.
