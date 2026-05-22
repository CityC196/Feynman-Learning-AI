param(
  [string]$HostName = "123.57.75.43",
  [string]$User = "deploy",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\ai_assist_deploy_ed25519",
  [string]$RemoteDir = "/opt/ai-assist-interview",
  [string]$ContainerName = "ai-assist-interview",
  [string]$ImageName = "ai-assist-interview:latest",
  [switch]$UploadEnv
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$cacheDir = Join-Path $root ".cache"
$archive = Join-Path $cacheDir "ai-assist-interview-deploy.tar.gz"

$files = @(
  "package.json",
  "package-lock.json",
  "server.js",
  "app.js",
  "index.html",
  "styles.css",
  "admin.html",
  "admin.js",
  "Dockerfile",
  ".dockerignore",
  "AGENT.md",
  "README.md",
  "PRODUCT.md",
  "DEPLOYMENT.md",
  "SERVER_HANDOFF.md",
  ".env.example",
  "render.yaml",
  "scripts/deploy.ps1",
  "scripts/server-status.ps1"
)

New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
Push-Location $root
try {
  npm run check
  tar -czf $archive @files

  ssh -i $KeyPath "$User@$HostName" "mkdir -p $RemoteDir/releases $RemoteDir/data"
  scp -i $KeyPath $archive "$User@$HostName`:$RemoteDir/releases/app.tar.gz"

  if ($UploadEnv) {
    scp -i $KeyPath (Join-Path $root ".env") "$User@$HostName`:$RemoteDir/.env"
    ssh -i $KeyPath "$User@$HostName" "chmod 600 $RemoteDir/.env"
  }

  $remoteScript = @"
set -e
cd $RemoteDir
rm -rf current
mkdir -p current data
tar -xzf releases/app.tar.gz -C current
test -f .env
sudo docker rm -f $ContainerName >/dev/null 2>&1 || true
sudo docker build -t $ImageName current
sudo docker run -d --name $ContainerName --restart unless-stopped --env-file $RemoteDir/.env -v $RemoteDir/data:/app/data -p 127.0.0.1:5173:5173 $ImageName
sleep 3
curl -fsS 'http://127.0.0.1:5173/api/health'
"@

  ($remoteScript -replace "`r`n", "`n") | ssh -i $KeyPath "$User@$HostName" "tr -d '\r' | bash -s"
  Write-Host "Deployment completed: https://ai-assist-interview.com"
}
finally {
  Pop-Location
}
