# Lambda Processor - Processa os pedidos da fila SQS FIFO em alta vazão
resource "aws_lambda_function" "processor" {
  filename         = "${path.module}/build/lambda-processor.zip"
  function_name    = "dvn_lambda_processor"
  role             = aws_iam_role.lambda_processor_role.arn
  handler          = "lambda-processor/processor.handler"
  runtime          = "nodejs22.x"
  architectures    = ["x86_64"]
  memory_size      = 512
  timeout          = 30

  environment {
    variables = {
      TABLE = aws_dynamodb_table.orders_table.name
    }
  }

  tags = {
    Name = "dvn_lambda_processor"
  }
}

# Gatilho Event Source Mapping (ESM) para conectar SQS FIFO à Lambda Processor
resource "aws_lambda_event_source_mapping" "sqs_processor_trigger" {
  event_source_arn                   = aws_sqs_queue.orders_queue.arn
  function_name                      = aws_lambda_function.processor.arn
  batch_size                         = 10
  function_response_types            = ["ReportBatchItemFailures"]
  scaling_config {
    maximum_concurrency = 13 # Concorrência calibrada para 100k pedidos
  }

  depends_on = [
    aws_iam_role_policy.processor_custom
  ]
}
