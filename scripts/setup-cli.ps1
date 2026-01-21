Param(
  [switch]$StartIpfsDocker,
  [switch]$SkipNpmInstall
)

$ErrorActionPreference = "Stop"

function Test-CommandExists {
  param([Parameter(Mandatory = $true)][string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-DockerComposeCommand {
  if (Test-CommandExists "docker") {
    try {
      docker compose version *> $null
      return @("docker", "compose")
    } catch {
      # Fallback to legacy docker-compose if installed
    }
  }
  if (Test-CommandExists "docker-compose") {
    return @("docker-compose")
  }
  return $null
}

function Invoke-DockerCompose {
  param(
    [Parameter(Mandatory = $true)][string[]]$Args
  )
  $compose = Get-DockerComposeCommand
  if (-not $compose) {
    throw "Docker Compose non trovato. Installa Docker Desktop (Compose v2) oppure docker-compose."
  }
  if ($compose.Length -gt 1) {
    & $compose[0] @($compose[1..($compose.Length - 1)]) @Args
  } else {
    & $compose[0] @Args
  }
}

function Get-RepoRoot {
  $here = (Get-Location).Path
  $candidate = $here
  while ($true) {
    if (Test-Path (Join-Path $candidate "fidesdpp\\package.json")) { return $candidate }
    $parent = Split-Path $candidate -Parent
    if ($parent -eq $candidate) { break }
    $candidate = $parent
  }
  throw "Esegui lo script dalla root del repo (cartella che contiene `fidesdpp/package.json`)."
}

$repoRoot = Get-RepoRoot
Set-Location $repoRoot

Write-Host "Repo root: $repoRoot"

if (-not (Test-CommandExists "node")) {
  Write-Host "Node.js non trovato. Installa Node.js 20.x (min 20.9) e riapri il terminale."
  Write-Host "Verifica poi con: node -v"
  exit 1
}
if (-not (Test-CommandExists "npm")) {
  Write-Host "npm non trovato. Reinstalla/aggiorna Node.js e riapri il terminale."
  exit 1
}

Write-Host ("Node: " + (node -v))
Write-Host ("npm: " + (npm -v))

$nodeVersionRaw = (node -v).Trim()
if ($nodeVersionRaw -match '^v(?<maj>\\d+)\\.(?<min>\\d+)\\.(?<patch>\\d+)$') {
  $nodeMajor = [int]$Matches['maj']
  if ($nodeMajor -ne 20) {
    Write-Host ""
    Write-Host "ATTENZIONE: il progetto richiede Node.js 20.x (min 20.9). Hai: $nodeVersionRaw"
    Write-Host "Consiglio: installa Node.js 20 LTS e ripeti lo script. Con Node 24 alcune dipendenze (es. esbuild/tsx) possono fallire su Windows."
  }
}

# Ensure env file exists
$envExample = Join-Path $repoRoot "fidesdpp\\.env.example"
$envLocal = Join-Path $repoRoot "fidesdpp\\.env.local"
if (-not (Test-Path $envLocal)) {
  Copy-Item $envExample $envLocal
  Write-Host "Creato: fidesdpp/.env.local (da .env.example)"
} else {
  Write-Host "OK: fidesdpp/.env.local già presente"
}

if ($StartIpfsDocker) {
  Write-Host "Avvio IPFS (Kubo) via Docker Compose..."
  Invoke-DockerCompose @("up", "-d", "kubo")
  Start-Sleep -Seconds 2
  try {
    $version = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5001/api/v0/version" -TimeoutSec 5
    $v = $version.Version
    if (-not $v) { $v = "unknown" }
    Write-Host ("IPFS OK: " + $v)
  } catch {
    Write-Host "IPFS non risponde su http://127.0.0.1:5001. Controlla `docker ps` e i log del container `fides-kubo`."
  }
} else {
  Write-Host "IPFS: se non lo hai già avviato, puoi usare Docker con:"
  Write-Host "  docker compose up -d kubo"
  Write-Host "oppure installare Kubo e lanciare `ipfs daemon`."
}

if (-not $SkipNpmInstall) {
  Write-Host "Installazione dipendenze npm (fidesdpp/)..."
  Push-Location (Join-Path $repoRoot "fidesdpp")
  try {
    if (Test-Path "package-lock.json") {
      npm ci
    } else {
      npm install
    }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "Skip npm install (richiesto)."
}

Write-Host ""
Write-Host "Pronto. Esempi:"
Write-Host "  cd fidesdpp"
Write-Host "  npm run cli -- --help"
Write-Host "  npm run cli -- verify-vc --token-id 5"
