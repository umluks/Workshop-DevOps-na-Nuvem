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
│   ├── api_gateway.tf             # Amazon API Gateway (REST API, Stages, Chaves e Recursos)
│   ├── lambda.tf                  # Funções AWS Lambda (Controller, Generator, Processor)
│   ├── dynamodb.tf                # Tabelas Amazon DynamoDB com particionamento/sharding
│   ├── sqs.tf                     # Filas SQS FIFO e Dead Letter Queues (DLQ)
│   ├── s3_cloudfront.tf           # Hospedagem estática com S3, CloudFront e OAC
│   ├── iam.tf                     # Roles e políticas de segurança de privilégio mínimo
│   ├── build-lambdas.sh           # Script de empacotamento das funções Lambda
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
- [AWS CLI](https://aws.amazon.com/cli/) configurado com credenciais válidas.
- [Terraform](https://www.terraform.io/) (v1.5+).
- [Node.js](https://nodejs.org/) (v20+ ou v22 LTS).

### 2. Provisionamento da Infraestrutura (`infra/`)

```bash
cd infra
terraform init
terraform plan
terraform apply
```

### 3. Build & Deploy dos Componentes

#### Lambdas (Backend)
```bash
cd dvn-workshop-nov-26/backend
npm ci
npm run build
```

#### Dashboard (Frontend)
```bash
cd dvn-workshop-nov-26/site
npm ci
npm run build
```

---

## 📚 Base de Conhecimento e Anotações

Consulte a documentação técnica detalhada no [NOTES.md](file:///c:/Users/Lucas/Desktop/Github%20Lucas/Workshop-DevOps-na-Nuvem/NOTES.md) ou navegue diretamente pelos tópicos na pasta `.gemini/notes/`:

- [Amazon CloudFront & OAC](file:///c:/Users/Lucas/Desktop/Github%20Lucas/Workshop-DevOps-na-Nuvem/.gemini/notes/cloudfront.md)
- [Amazon S3 — Classes e Boas Práticas](file:///c:/Users/Lucas/Desktop/Github%20Lucas/Workshop-DevOps-na-Nuvem/.gemini/notes/s3.md)
- [AWS Lambda, Cold Starts e Concorrência](file:///c:/Users/Lucas/Desktop/Github%20Lucas/Workshop-DevOps-na-Nuvem/.gemini/notes/lambda.md)
- [Amazon API Gateway & Usage Plans](file:///c:/Users/Lucas/Desktop/Github%20Lucas/Workshop-DevOps-na-Nuvem/.gemini/notes/api-gateway.md)
- [Amazon SQS & Comparativo de Mensageria](file:///c:/Users/Lucas/Desktop/Github%20Lucas/Workshop-DevOps-na-Nuvem/.gemini/notes/sqs.md)
- [Arquitetura para 1 Milhão de Usuários / Black Friday](file:///c:/Users/Lucas/Desktop/Github%20Lucas/Workshop-DevOps-na-Nuvem/.gemini/notes/arquitetura-escalavel-resiliente-aws.md)
