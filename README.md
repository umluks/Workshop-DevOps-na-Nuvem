# Workshop DevOps na Nuvem ☁️🚀

Repositório central de código, infraestrutura como código (IaC), arquitetura e base de conhecimento desenvolvida durante o **Workshop DevOps na Nuvem**.

---

## 🏛️ Estrutura do Repositório

```text
Workshop-DevOps-na-Nuvem/
├── infra/                          # Infraestrutura como Código (Terraform)
│   ├── main.tf                    # Provider AWS e configurações globais
│   ├── variables.tf               # Variáveis de entrada parametrizadas
│   ├── outputs.tf                 # Endpoints, ARNs e dados de saída
│   ├── dvn_api_gateway.tf         # Amazon API Gateway (REST API, Stages, Chaves e Recursos)
│   ├── dvn_gateway_responses.tf   # Respostas padronizadas de Gateway e CORS
│   ├── dvn_lambda_controller.tf   # Lambda Controller (orquestração e status)
│   ├── dvn_lambda_generator.tf    # Lambda Generator (geração de carga assíncrona)
│   ├── dvn_lambda_processor.tf    # Lambda Processor (consumo SQS FIFO e escrita DynamoDB)
│   ├── dvn_dynamodb.tf            # Tabelas Amazon DynamoDB com particionamento/sharding
│   ├── dvn_sqs.tf                 # Filas SQS FIFO e Dead Letter Queues (DLQ)
│   ├── dvn_s3_cloudfront.tf       # Hospedagem estática com S3, CloudFront e OAC
│   ├── dvn_iam.tf                 # Roles e políticas de segurança de privilégio mínimo
│   ├── package.mjs                # Script Node.js multiplataforma para empacotamento dos Lambdas
│   ├── build-lambdas.sh           # Script Bash de empacotamento das funções Lambda
│   └── deploy-frontend.sh         # Script de build e deploy do frontend para o S3
│
├── dvn-workshop-nov-26/           # Aplicação e Simulador de Carga
│   ├── backend/                   # Código-fonte das funções Lambda (TypeScript/Node.js)
│   │   ├── lambda-controller/     # Controle de execuções, sharding e estado
│   │   ├── lambda-generator/      # Disparador assíncrono de requisições em lote
│   │   ├── lambda-processor/      # Processador de pedidos integrando com SQS FIFO
│   │   └── shared/                # Bibliotecas compartilhadas (DB, tipos, latência)
│   ├── site/                      # Frontend em React + Vite + TypeScript (Dashboard)
│   │   └── public/                # Roteiros e guias práticos do workshop
│   └── k6-load-test/              # Scripts de testes de estresse e carga via k6 e Go
│
├── NOTES.md                       # Índice consolidado e diário de bordo técnico
├── .gemini/                       # Ecossistema do Copiloto de IA e Documentação Profunda
│   ├── context/                   # Context engineering (project_state, domain_knowledge, workshop_brief)
│   ├── contracts/                 # Schemas JSON e validações de payloads
│   ├── prompts/                   # Templates versionados de Prompt-as-Code
│   ├── skills/                    # Skills especializadas do agente (aws-rag-notes, iac-validator)
│   ├── notes/                     # Guias conceituais aprofundados (CloudFront, S3, OAC, SQS, etc.)
│   ├── docs/                      # Diagramas e recursos visuais da arquitetura
│   └── rules/                     # Governança, arquitetura de referência e diretrizes do agente
│
├── .gitignore                     # Regras de exclusão do Git
└── README.md                      # Documentação central do projeto
```

---

## ⚡ Arquitetura da Solução

A solução implementa uma arquitetura **Serverless** altamente escalável, resiliente e desacoplada na AWS:

1. **Camada de Borda & Frontend:**
   - **Amazon CloudFront** distribuindo conteúdo estático globalmente com baixa latência.
   - **Amazon S3** como bucket de origem protegido via **Origin Access Control (OAC)** (acesso direto bloqueado).
   - **Frontend React (Vite)** com dashboard de acompanhamento de status em tempo real.

2. **Camada de Entrada & API:**
   - **Amazon API Gateway** gerenciando rotas REST, CORS, Usage Plans, API Keys e throttling.

3. **Computação & Mensageria Serverless:**
   - **AWS Lambda (Controller):** Inicializa os estados e gerencia as execuções de teste.
   - **AWS Lambda (Generator):** Orquestra trabalhadores em concorrência para geração de carga distribuída.
   - **Amazon SQS (FIFO):** Fila de mensageria com ordenação estrita e deduplicação para garantir integridade.
   - **AWS Lambda (Processor):** Consome eventos da fila em lotes e atualiza o inventário.
   - **Amazon DynamoDB:** Armazenamento chave-valor NoSQL de ultra baixa latência com particionamento em shards para evitar estrangulamento (*hot partitions*).

---

## 🚀 Como Executar

### 1. Pré-requisitos
- [AWS CLI](https://aws.amazon.com/cli/) instalado e autenticado (`aws configure` ou variáveis de ambiente `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`).
- [Terraform](https://www.terraform.io/) (v1.5+ ou OpenTofu).
- [Node.js](https://nodejs.org/) (v20+ ou v22 LTS) e npm.

---

### 2. Passo a Passo Completo para Subir a Aplicação

O provisionamento da infraestrutura depende dos artefatos compactados dos Lambdas (`infra/build/*.zip`). Siga a ordem recomendada:

#### Passo 2.1 — Compilar o Backend e Gerar os Pacotes das Lambdas

No Windows (PowerShell):
```powershell
# 1. Compilar código TypeScript do Backend
cd dvn-workshop-nov-26/backend
npm ci
npm run build
npm prune --omit=dev

# 2. Empacotar as funções em ZIP na pasta infra/build
cd ../../infra
npm ci
node package.mjs
```

No Linux / macOS / Git Bash:
```bash
# Executa compilação e empacotamento completo automaticamente
cd infra
chmod +x build-lambdas.sh
./build-lambdas.sh
```

> **Verificação:** Certifique-se de que os arquivos `lambda-controller.zip`, `lambda-generator.zip` e `lambda-processor.zip` foram gerados dentro de `infra/build/`.

---

#### Passo 2.2 — Provisionar a Infraestrutura com Terraform

Com os pacotes `.zip` gerados, execute o Terraform a partir da pasta `infra`:

```bash
cd infra

# 1. Inicializar plugins e providers
terraform init

# 2. Validar sintaxe e formatação (opcional)
terraform fmt -check
terraform validate

# 3. Planejar o provisionamento dos recursos
terraform plan

# 4. Aplicar e provisionar a infraestrutura na AWS
terraform apply -auto-approve
```

Ao término, o Terraform exibirá os `outputs` com as URLs e credenciais geradas:
- `api_gateway_invoke_url`: URL base para chamadas REST.
- `cloudfront_domain_name`: URL pública (HTTPS) do frontend no CloudFront.
- `api_key_value`: Chave de API gerada para o painel administrativo.
- `s3_bucket_name`: Nome do bucket S3 de hospedagem estática.
- `sqs_main_queue_url` / `sqs_dlq_queue_url`: URLs das filas de processamento.

---

#### Passo 2.3 — Build & Deploy do Frontend (Dashboard Web)

Com a infraestrutura provisionada, publique o site estático no S3 e atualize o cache do CloudFront:

No Linux / macOS / Git Bash:
```bash
cd infra
chmod +x deploy-frontend.sh
./deploy-frontend.sh
```

No Windows (PowerShell):
```powershell
cd infra

# Obter valores de saída do Terraform
$API_URL = terraform output -raw api_gateway_invoke_url
$BUCKET_NAME = terraform output -raw s3_bucket_name
$CF_DIST_ID = terraform output -raw cloudfront_distribution_id

# Configurar variáveis de ambiente do Frontend
cd ../dvn-workshop-nov-26/site
Set-Content -Path .env -Value "VITE_API_URL=$API_URL"

# Instalar dependências e compilar SPA
npm ci
npm run build

# Sincronizar build com o Bucket S3
aws s3 sync dist/ "s3://$BUCKET_NAME" --delete

# Invalidar cache da distribuição CloudFront
aws cloudfront create-invalidation --distribution-id $CF_DIST_ID --paths "/*"
```

---

### 3. Comandos Úteis do Terraform para Operação

| Comando | Finalidade |
|---|---|
| `terraform output` | Exibe todos os dados e URLs exportados da infraestrutura. |
| `terraform output -raw api_key_value` | Recupera a API Key secreta para autenticação no painel. |
| `terraform state list` | Lista todos os recursos gerenciados no estado atual. |
| `terraform refresh` | Sincroniza o estado local (`terraform.tfstate`) com a realidade da AWS. |
| `terraform destroy` | Destrói todos os recursos provisionados para evitar custos residuais. |

---

## 📚 Base de Conhecimento e Anotações

Consulte a documentação técnica detalhada no [NOTES.md](file:///c:/Users/Lucas/Desktop/Github%20Lucas/Workshop-DevOps-na-Nuvem/NOTES.md) ou navegue diretamente pelos tópicos na pasta `.gemini/notes/`:

- [Amazon CloudFront & OAC](file:///c:/Users/Lucas/Desktop/Github%20Lucas/Workshop-DevOps-na-Nuvem/.gemini/notes/cloudfront.md)
- [Amazon S3 — Classes e Boas Práticas](file:///c:/Users/Lucas/Desktop/Github%20Lucas/Workshop-DevOps-na-Nuvem/.gemini/notes/s3.md)
- [AWS Lambda, Cold Starts e Concorrência](file:///c:/Users/Lucas/Desktop/Github%20Lucas/Workshop-DevOps-na-Nuvem/.gemini/notes/lambda.md)
- [Amazon API Gateway & Usage Plans](file:///c:/Users/Lucas/Desktop/Github%20Lucas/Workshop-DevOps-na-Nuvem/.gemini/notes/api-gateway.md)
- [Amazon SQS & Comparativo de Mensageria](file:///c:/Users/Lucas/Desktop/Github%20Lucas/Workshop-DevOps-na-Nuvem/.gemini/notes/sqs.md)
- [Arquitetura para 1 Milhão de Usuários / Black Friday](file:///c:/Users/Lucas/Desktop/Github%20Lucas/Workshop-DevOps-na-Nuvem/.gemini/notes/arquitetura-escalavel-resiliente-aws.md)
