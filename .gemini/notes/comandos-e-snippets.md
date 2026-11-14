# ⚙️ Comandos Úteis & Snippets de Infraestrutura

Coleção de comandos rápidos para o ciclo de desenvolvimento, infraestrutura e observabilidade.

---

## 1. Git & Versionamento
```bash
# Verificar status e ramos
git status
git branch -a

# Sincronização segura
git pull --rebase origin main

# Criação de branch atômica
git checkout -b feature/nova-funcionalidade
```

---

## 2. Docker & Containers
```bash
# Listar containers ativos e finalizados
docker ps -a

# Subir ambiente em segundo plano
docker compose up -d

# Visualizar logs em tempo real
docker compose logs -f

# Limpeza de recursos não utilizados (imagens, redes, volumes)
docker system prune -f
```

---

## 3. AWS CLI
```bash
# Listar distribuições do CloudFront
aws cloudfront list-distributions --output table

# Criar invalidação no CloudFront
aws cloudfront create-invalidation --distribution-id <DISTRIBUTION_ID> --paths "/*"

# Listar filas SQS
aws sqs list-queues

# Enviar mensagem de teste para fila SQS FIFO
aws sqs send-message \
  --queue-url <QUEUE_URL> \
  --message-body '{"orderId":"123","qtd":1}' \
  --message-group-id "shard-0" \
  --message-deduplication-id "uuid-123"
```

---

## 4. Terraform
```bash
# Inicializar provedores e módulos
terraform init

# Validar sintaxe
terraform validate

# Planejar execução
terraform plan -out=tfplan

# Aplicar mudanças planejadas
terraform apply tfplan
```
