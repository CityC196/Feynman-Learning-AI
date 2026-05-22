# Server Handoff

This file is the operational handoff for future Codex/chat windows. It records deployment facts and sync workflow, but it must not contain secrets.

## Production

- App domain: `https://ai-assist-interview.com`
- Alternate domain: `https://www.ai-assist-interview.com`
- Admin page: `https://ai-assist-interview.com/admin.html`
- Health check: `https://ai-assist-interview.com/api/health`
- Server IP: `123.57.75.43`
- SSH user: `deploy`
- SSH key on this machine: `%USERPROFILE%\.ssh\ai_assist_deploy_ed25519`
- Server OS: Ubuntu 22.04 LTS
- Project directory: `/opt/ai-assist-interview`
- Runtime data directory: `/opt/ai-assist-interview/data`
- Runtime env file: `/opt/ai-assist-interview/.env`
- Docker container: `ai-assist-interview`
- Docker image: `ai-assist-interview:latest`
- App internal port: `127.0.0.1:5173`
- Nginx site: `/etc/nginx/sites-available/ai-assist-interview`
- TLS certificate: `/etc/letsencrypt/live/ai-assist-interview.com/`

## Secret Locations

Do not put these values in git or chat:

- `ZHIPU_API_KEY`
- `ADMIN_TOKEN`
- SSH private keys
- Production `data/research-store.json`

Production secrets live only on the server at `/opt/ai-assist-interview/.env`.

## Current Architecture

- Node.js app served by Docker.
- Nginx terminates HTTPS and proxies to `http://127.0.0.1:5173`.
- Users can choose local-only storage or anonymous research sync.
- Research sync data is stored in `/opt/ai-assist-interview/data/research-store.json`.
- Admin data is available only through `/admin.html` plus `ADMIN_TOKEN`.

## Normal Sync Workflow

Use local files as the source of truth for code.

1. Make code changes locally.
2. Run `npm run check`.
3. Commit changes to git.
4. Deploy local code to server:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
```

5. Verify production:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/server-status.ps1
```

If a git remote is configured, push after the commit. At the time this file was created, no remote was configured.

## Server Commands

Check container:

```bash
sudo docker ps -a
sudo docker logs --tail 80 ai-assist-interview
curl -fsS http://127.0.0.1:5173/api/health
```

Reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Restart app container:

```bash
sudo docker restart ai-assist-interview
```

## Important Notes

- Do not restart the old container `ai-interview-ai-interview-1`; it was stopped when this app was deployed.
- Do not overwrite `/opt/ai-assist-interview/.env` unless intentionally rotating secrets.
- Do not delete `/opt/ai-assist-interview/data` unless intentionally deleting research data.
- If `ZHIPU_API_KEY` was shared in chat, rotate it in the provider console and update the server `.env`.
