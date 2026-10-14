# Hoshimi Station (EN fork) — Deployment Instructions

Deploys `tokanada/hoshimi-station-en` with Docker on a server on an internal network.
Network exposure (reverse proxy, firewall, access control) is handled separately by you; this document only covers the app.

## 1. Get the code and the database onto the server

```bash
git clone git@github.com:tokanada/hoshimi-station-en.git
cd hoshimi-station-en
mkdir -p data
```

The database (~413MB) is gitignored and is NOT in the repo. Copy it from your workstation
(stop the local app first so the DB is not mid-write):

```bash
scp ~/hoshimi-station-en/data/hoshimi.sqlite3 server:~/hoshimi-station-en/data/
mkdir -p backups
chown -R 1001:1001 data backups    # the container runs as HOSHIMI_UID/GID (non-root)
```

## 2. Configure `.env`

```bash
cp env.example .env
```

| Variable | What to set |
|---|---|
| `HOSHIMI_SITE_URL` | Exact URL browsers will use, e.g. `http://hoshimi.lan:3042` or `http://192.168.1.20:3042`. Becomes `ORIGIN`; if it does not match, SvelteKit rejects POSTs with 403. |
| `ADMIN_NICKNAMES` | Comma-separated admin nicknames, e.g. `tokanada`. |
| `CODEX_API_TOKEN` | Long random string (`openssl rand -hex 32`). Required for the MCP / Codex API. |
| `RECENT_WORK_API_TOKEN` | Optional token for the recent-work API. |
| `GEMINI_API_KEY` | Optional. Gemini free tier (model `gemini-2.5-flash`, limited to 10 requests/min via `AI_RPM`). |
| `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL` | Optional. LiteLLM or any OpenAI-compatible proxy; set `AI_RPM=0` (the proxy rate-limits). |
| `HYPER_API_KEY` | Leave empty. The old hardcoded key was leaked upstream and must not be used. |
| `HOSHIMI_UID` / `HOSHIMI_GID` | Output of `id -u` / `id -g` on the server (owner of `./data`). |

Leave all AI keys empty to keep the AI-translate feature off.
Never commit `.env`; it is gitignored.

## 3. Decide how it is reached

`compose.yml` publishes `127.0.0.1:3042:3042`, so only the server itself can reach it. Either:

- put your reverse proxy on the same host and point it at `127.0.0.1:3042`, or
- for direct LAN access, change the port line to `"0.0.0.0:3042:3042"` (or your LAN IP) and keep it firewalled to the internal network.

## 4. Start

```bash
docker compose up -d --build
docker compose ps          # healthcheck should report "healthy"
docker compose logs -f
```

## 5. First-run provisioning

1. Open the site and register your admin nickname (e.g. `tokanada`) with a PIN first. Registering an unused nickname creates the user; only nicknames listed in `ADMIN_NICKNAMES` get admin rights.
2. Each contributor registers their own nickname and PIN.
3. Configure the MCP client with `CODEX_API_TOKEN` (URL and env: see `docs/codex-mcp.md` in the repo).
4. If the site is behind Cloudflare Access (optional):
   - In Zero Trust, go to Access → Service Auth → Service Tokens and create a token. Copy the Client ID and Client Secret immediately; the secret is shown only once.
   - Add a policy with action **Service Auth** that includes the token to the Access application protecting the site. A normal Allow policy does not accept service tokens. You can scope it to `/api/codex/*`.
   - In `mcp/.env` on the client machine, set both `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` (both or neither; the client refuses to start with only one). The MCP client sends them as `CF-Access-Client-Id` / `CF-Access-Client-Secret` headers alongside the bearer token.
   - Use an `https://` URL for `HOSHIMI_SITE_URL` in both the server `.env` and `mcp/.env`, because the MCP client does not follow redirects.

PINs are stored as scrypt hashes. Any legacy plaintext PIN in an imported DB is upgraded to a hash on that user's first successful login.

## 6. Backup and disk usage

All state is `data/hoshimi.sqlite3` (~413MB). The DB uses WAL, so never plain `cp` it while running.
`scripts/backup.sh` takes an online backup, checks integrity, gzips it (~55MB each) and deletes
backups older than N days (default 7). Run it as the user that owns `./data` (uid 1001), e.g. in that user's crontab:

```bash
15 3 * * * cd /path/to/hoshimi-station-en && scripts/backup.sh data/hoshimi.sqlite3 backups 7
```

(needs the `sqlite3` CLI or `python3`.) Disk budget: DB ~0.4GB + WAL (capped at 64MB after checkpoints)
+ 7 backups ~0.4GB + container logs (capped at 3x10MB) + image ~0.3GB, so about 1.5GB. The edit-history
table grows slowly with each translation edit. Copy `backups/` off the host if you want a real second copy.

Container hardening in `compose.yml`: non-root user, read-only root filesystem (only `./data` and a 64MB
tmpfs `/tmp` are writable), all capabilities dropped, no-new-privileges, 1GB memory and 256 process limits.

## 7. Update

```bash
git pull
docker compose up -d --build
```

`./data` is a bind mount and survives rebuilds.

## 8. Live verification checklist (not yet tested)

- Healthcheck reports healthy; login and save work (over plain `http://`, check the browser console for cookie/origin errors if not).
- G.3: an AI job produces a suggestion; accepting it writes the text; a stale suggestion returns 409; the daily cap (10) applies and admins bypass it.
- MCP: read and submit work with `CODEX_API_TOKEN`.
- G.5: two contributors translate and review at the same time with claims intact; external access is gated by your proxy/firewall.

## 9. Security notes

- The `sk-hyper-…` key was committed upstream (CyleAR/hoshimi-station, commit `900a9d9`) and is in every fork's git history. Only its owner can revoke it; do not use it.
- A local `ecosystem.config.cjs` (PM2) is untracked and gitignored; use `ecosystem.config.example.cjs` as a template for non-Docker setups. Never commit the real file.
- Do not publish port 3042 to untrusted networks; PIN login alone is not a perimeter.
