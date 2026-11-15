# Project State

## Status Geral
- **Data da Última Atualização**: 15 de Novembro de 2026.
- **Fase**: Consolidação e Otimização da Arquitetura Serverless + Setup do Agente / RAG Local.

## Componentes Provisionados e Mapeados
1. **Infraestrutura (`infra/`)**:
   - `api_gateway.tf`: API Gateway REST com endpoints mapeados para funções Lambda.
   - `lambda.tf`: Definição de funções com runtime Node.js, empacotadas via script.
   - `sqs.tf`: Fila SQS desacoplando requisições de alto volume.
   - `dynamodb.tf`: Tabela NoSQL com provisionamento on-demand (PAY_PER_REQUEST).
   - `s3_cloudfront.tf`: Distribuição CloudFront com OAC e bucket S3 com restrição de acesso público.
   - `iam.tf`: Políticas IAM de menor privilégio para execução das Lambdas e integração SQS/DynamoDB.

2. **Carga e Testes (`dvn-workshop-nov-26/k6-load-test/`)**:
   - Testes de stress e carga simulando picos de requisições concorrentes.

3. **Base de Conhecimento e Anotações (`.gemini/notes/`)**:
   - 21 notas de arquitetura e serviços cobrindo: ALB, Amplify, API Gateway, CloudFront, CloudWatch, Cognito, Cold Start, Concorrência Provisionada, Decisões Arquiteturais, Lambda, OAC, Rolling Update, S3, Security Groups, SQS, Usage Plan e WAF.

## Próximos Marcos
- [ ] Configuração de validação estrita de contratos de payload entre API Gateway e Lambdas.
- [ ] Instrumentação e refinamento de observabilidade (CloudWatch Logs & Metrics / X-Ray).
- [ ] Validação contínua de segurança IaC com checks automatizados.
