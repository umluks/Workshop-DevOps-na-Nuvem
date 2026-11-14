#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SITE_DIR="$ROOT_DIR/dvn-workshop-nov-26/site"

echo "=========================================================="
echo "          BUILD E DEPLOY DO FRONTEND (REACT)"
echo "=========================================================="

cd "$SCRIPT_DIR"

echo "--> 1. Obtendo outputs do Terraform..."
API_URL=$(terraform output -raw api_gateway_invoke_url)
BUCKET_NAME=$(terraform output -raw s3_bucket_name)
CF_URL=$(terraform output -raw cloudfront_domain_name)
API_KEY=$(terraform output -raw api_key_value)

echo "    API URL: $API_URL"
echo "    Bucket S3: $BUCKET_NAME"

echo "--> 2. Configurando .env do site..."
cd "$SITE_DIR"
cat <<EOF > .env
VITE_API_URL=$API_URL
EOF

echo "--> 3. Instalando dependencias do frontend (npm ci)..."
npm ci

echo "--> 4. Gerando build estatico do React (npm run build)..."
npm run build

echo "--> 5. Enviando arquivos compilados para o S3 (s3 sync)..."
aws s3 sync dist/ "s3://$BUCKET_NAME" --delete

echo "--> 6. Invalidando cache do CloudFront..."
CF_DIST_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || aws cloudfront list-distributions --query "DistributionList.Items[?DefaultRootObject=='index.html'].Id" --output text | awk '{print $1}')
if [ -n "$CF_DIST_ID" ]; then
  aws cloudfront create-invalidation --distribution-id "$CF_DIST_ID" --paths "/*" > /dev/null 2>&1 || true
fi

echo "=========================================================="
echo "   APLICACAO PUBLICADA COM SUCESSO!"
echo "=========================================================="
echo "URL do Painel (CloudFront): $CF_URL"
echo "Sua API Key para colar no Painel: $API_KEY"
echo "=========================================================="
