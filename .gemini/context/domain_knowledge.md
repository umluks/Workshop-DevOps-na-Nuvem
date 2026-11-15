# Domain Knowledge: AWS Serverless & Resiliência

## Padrões Arquiteturais Adotados

### 1. Desacoplamento Assíncrono com SQS (Queue-Based Load Leveling)
- **Problema**: Picos de requisições repentinas podem esgotar concorrência do Lambda ou sobrecarregar bancos de dados relacionais/downstream.
- **Solução**: API Gateway encaminha mensagens diretamente para SQS (ou via Lambda producer ultraleve), amortecendo o tráfego. Lambdas consumers processam em batches (`batch_size` e `maximum_batching_window_in_seconds`).

### 2. Entrega Segura de SPA com CloudFront + OAC (Origin Access Control)
- **Segurança**: Buckets S3 mantêm `block_public_acls = true` e `block_public_policy = true`. O acesso é delegado exclusivamente à identidade do CloudFront via Bucket Policy condicional ao ARN da distribuição (`AWS:SourceArn`).

### 3. Mitigação de Cold Starts no AWS Lambda
- Empacotamento enxuto de dependências (evitando bibliotecas desnecessárias no bundle final).
- Inicialização de conexões e clientes SDK (ex.: `DynamoDBClient`) fora do handler de execução (escopo global/reuso de container).
- Avaliação de Concorrência Provisionada (*Provisioned Concurrency*) apenas para rotas críticas de baixa latência síncrona.

### 4. DynamoDB On-Demand (PAY_PER_REQUEST)
- Elimina a necessidade de planejamento prévio de capacidade em workloads imprevisíveis, ajustando automaticamente a taxa de leitura e escrita instantaneamente.
