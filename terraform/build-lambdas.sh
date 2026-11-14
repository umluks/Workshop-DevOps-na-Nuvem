#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/dvn-workshop-nov-26/backend"
BUILD_DIR="$SCRIPT_DIR/build"

echo "=========================================================="
echo "   COMPILANDO BACKEND E EMPACOTANDO COM POWERSHELL ZIP"
echo "=========================================================="

mkdir -p "$BUILD_DIR"

cd "$BACKEND_DIR"
echo "--> 1. Instalando dependencias e compilando TypeScript..."
npm ci
npm run build
npm prune --omit=dev

echo "--> 2. Gerando pacotes ZIP via PowerShell nativo..."

# Converte os caminhos para formato Windows absoluto (ex: C:\Users\...)
WIN_BACKEND_DIR=$(cygpath -w "$BACKEND_DIR")
WIN_BUILD_DIR=$(cygpath -w "$BUILD_DIR")

powershell.exe -NoProfile -Command "
  \$backendDir = '$WIN_BACKEND_DIR'
  \$distDir = Join-Path \$backendDir 'dist'
  \$buildDir = '$WIN_BUILD_DIR'
  
  if (!(Test-Path \$buildDir)) { New-Item -ItemType Directory -Path \$buildDir -Force | Out-Null }
  
  \$functions = @('lambda-controller', 'lambda-generator', 'lambda-processor')
  foreach (\$fn in \$functions) {
    Write-Host \"    Criando \$fn.zip...\"
    \$staging = Join-Path \$buildDir \"staging_\$fn\"
    if (Test-Path \$staging) { Remove-Item -Recurse -Force \$staging }
    
    New-Item -ItemType Directory -Path (Join-Path \$staging \$fn) -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path \$staging 'shared') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path \$staging 'node_modules') -Force | Out-Null
    
    # Copiar funcao compilada
    Copy-Item -Recurse -Force (Join-Path \$distDir \"\$fn\*\") (Join-Path \$staging \$fn)
    # Copiar shared compilada
    Copy-Item -Recurse -Force (Join-Path \$distDir 'shared\*') (Join-Path \$staging 'shared')
    # Copiar package.json
    Copy-Item -Force (Join-Path \$backendDir 'package.json') \$staging
    # Copiar node_modules de producao
    Copy-Item -Recurse -Force (Join-Path \$backendDir 'node_modules\*') (Join-Path \$staging 'node_modules')
    
    \$zipPath = Join-Path \$buildDir \"\$fn.zip\"
    if (Test-Path \$zipPath) { Remove-Item -Force \$zipPath }
    
    # Comprime usando .NET ZipFile nativo (PKZip 100% compativel com Lambda)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory(\$staging, \$zipPath, [System.IO.Compression.CompressionLevel]::Optimal, \$false)
    
    Remove-Item -Recurse -Force \$staging
    Write-Host \"    [SUCESSO] \$fn.zip criado!\"
  }
"

echo "--> 3. Restaurando dependencias no backend..."
npm install --silent

echo "=========================================================="
echo "   PACOTES ZIP VALIDADOS E PRONTOS PARA O TERRAFORM!"
echo "=========================================================="
ls -lh "$BUILD_DIR"
