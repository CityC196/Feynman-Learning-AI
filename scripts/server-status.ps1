param(
  [string]$HostName = "123.57.75.43",
  [string]$User = "deploy",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\ai_assist_deploy_ed25519"
)

$ErrorActionPreference = "Stop"

Write-Host "Checking production health..."
node -e "fetch('https://ai-assist-interview.com/api/health').then(async r=>{console.log(r.status); console.log(await r.text())}).catch(e=>{console.error(e); process.exit(1)})"

Write-Host "`nChecking server services..."
ssh -i $KeyPath "$User@$HostName" @'
set -e
echo "== Docker containers =="
sudo docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo
echo "== App health =="
curl -fsS http://127.0.0.1:5173/api/health
echo
echo "== App logs =="
sudo docker logs --tail 40 ai-assist-interview
echo
echo "== Nginx =="
sudo nginx -t
echo
echo "== Certificates =="
sudo certbot certificates | sed -n '1,120p'
'@
