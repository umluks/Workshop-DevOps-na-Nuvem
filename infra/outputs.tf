output "api_gateway_invoke_url" {
  description = "URL base de invocacao da API Gateway, incluindo o stage /live"
  value       = "${aws_api_gateway_stage.live_stage.invoke_url}"
}

output "api_key_value" {
  description = "Chave de API gerada para inserir no painel web"
  value       = aws_api_gateway_api_key.orders_key.value
  sensitive   = true
}

output "cloudfront_domain_name" {
  description = "Dominio CloudFront para acessar a aplicacao no navegador"
  value       = "https://${aws_cloudfront_distribution.frontend_distribution.domain_name}"
}

output "cloudfront_distribution_id" {
  description = "ID da distribuicao CloudFront"
  value       = aws_cloudfront_distribution.frontend_distribution.id
}

output "s3_bucket_name" {
  description = "Nome do bucket S3 criado para o frontend"
  value       = aws_s3_bucket.frontend_bucket.id
}

output "dynamodb_table_name" {
  description = "Nome da tabela DynamoDB"
  value       = aws_dynamodb_table.orders_table.name
}

output "sqs_main_queue_url" {
  description = "URL da fila SQS FIFO principal"
  value       = aws_sqs_queue.orders_queue.url
}

output "sqs_dlq_queue_url" {
  description = "URL da fila SQS FIFO DLQ"
  value       = aws_sqs_queue.orders_dlq.url
}
