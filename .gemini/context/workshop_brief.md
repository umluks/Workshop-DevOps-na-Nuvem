# Context: Workshop DevOps na Nuvem

## Dados do Evento & Projeto
- **Datas**: 14 e 15 de Novembro de 2026.
- **Tema Central**: Projeto e implementação de arquitetura Serverless na AWS para suportar alta carga e escala.
- **Pilares Técnicos**: System Design, Terraform (IaC), AWS Serverless (API Gateway, Lambda, SQS, DynamoDB, S3, CloudFront), Testes de Carga (k6) e Agentes de IA (Agentic DevOps).

## Estado Atual da Infraestrutura e Aplicação
- **Infraestrutura (`infra/`)**: Código Terraform modular para API Gateway REST, Lambdas (Node.js), Fila SQS, DynamoDB com billing on-demand, Bucket S3 privado com CloudFront + OAC (Origin Access Control) e IAM roles com princípio de menor privilégio.
- **Aplicação (`dvn-workshop-nov-26/`)**:
  - `backend/`: Handlers Lambda (ex.: listagem, processamento assíncrono via SQS).
  - `site/`: Frontend SPA integrado via S3 + CloudFront.
  - `k6-load-test/`: Scripts de teste de carga para avaliar throughput e cold starts.

## Metas e Critérios de Aceite
1. **Governança & RAG Local**: Manter anotações (`notes/`) organizadas e indexadas para recuperação contextual rápida via busca semântica ou lexical.
2. **Rigor de Produção em IaC**: Validações pré-commit de segurança (Checkov, tfsec/trivy) e formatação (`terraform fmt`).
3. **Automação Agêntica**: Utilizar personas e prompts estruturados para revisões de segurança, análise de logs do CloudWatch e mitigação de gargalos.
4. **Alinhamento com AWS Well-Architected Framework**: Excelência Operacional, Segurança, Confiabilidade, Eficiência de Performance e Otimização de Custos.
