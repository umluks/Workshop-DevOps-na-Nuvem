# 1. Fila de Letras Mortas (DLQ FIFO) - recebe mensagens que falharam após 20 tentativas
resource "aws_sqs_queue" "orders_dlq" {
  name                        = "${var.project_name}_sqs_dlq.fifo"
  fifo_queue                  = true
  sqs_managed_sse_enabled     = true # Criptografia SSE-SQS
  message_retention_seconds   = 1209600 # 14 dias

  tags = {
    Name = "${var.project_name}_sqs_dlq"
  }
}

# 2. Fila Principal FIFO - recebe os pedidos em alta vazão com ordenação por shard
resource "aws_sqs_queue" "orders_queue" {
  name                        = "${var.project_name}_sqs.fifo"
  fifo_queue                  = true
  content_based_deduplication = false # Desabilitado pois o Gateway envia orderId explicitamente
  fifo_throughput_limit       = "perMessageGroupId"
  deduplication_scope         = "messageGroup"
  sqs_managed_sse_enabled     = true
  
  # 180 segundos: 6x o timeout da Processor (30s) conforme recomendação AWS
  visibility_timeout_seconds  = 180
  message_retention_seconds   = 86400 # 1 dia

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.orders_dlq.arn
    maxReceiveCount     = 20
  })

  tags = {
    Name = "${var.project_name}_sqs"
  }
}
