---
name: aws-rag-notes
description: "Consulta e recupera contexto técnico especializado a partir das 21 notas de arquitetura e serviços AWS do repositório (.gemini/notes/)."
---

# AWS RAG Notes Skill

## Finalidade
Fornece mecanismo padronizado de busca e recuperação de conhecimento nas anotações de arquitetura da nuvem AWS (`.gemini/notes/`), cobrindo decisões de design, padrões de resiliência, cold start, mensageria e boas práticas.

## Quando Utilizar
- Sempre que o usuário solicitar explicações, comparações de serviços (ex.: SQS vs RabbitMQ vs Kafka), detalhes sobre OAC, WAF, CloudFront, API Gateway, DynamoDB ou Lambda.
- Quando for necessário fundamentar uma decisão técnica ou ADR com base no conteúdo consolidado no repositório.

## Índice de Tópicos Mapeados
1. **API & Edge**: `alb-elastic-load-balancing.md`, `api-gateway.md`, `cloudfront.md`, `oac.md`, `waf.md`, `usage-plan.md`
2. **Compute & Serverless**: `lambda.md`, `cold-start.md`, `concorrencia-provisionada.md`, `solucao-geracao-de-carga-serverless.md`
3. **Storage & Database**: `s3.md`, `dynamodb.tf` (infra)
4. **Mensageria & Integração**: `sqs.md`, `comparativo-mensageria-sqs-elk-rabbitmq-kafka.md`
5. **Observabilidade & Segurança**: `cloudwatch.md`, `cognito.md`, `security-groups.md`, `rolling-update.md`, `decisoes-arquiteturais.md`

## Fluxo de Operação
1. Identifique o tópico solicitado e leia o arquivo correspondente em `.gemini/notes/<topico>.md`.
2. Extraia os trade-offs, configurações recomendadas e snippets práticos.
3. Apresente a resposta contextualizada ao projeto com referências e links diretos para as notas.
