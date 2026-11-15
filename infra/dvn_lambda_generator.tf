# Lambda Generator - Responsável por gerar cargas de pedidos simuladas
resource "aws_lambda_function" "generator" {
  filename         = "${path.module}/build/lambda-generator.zip"
  function_name    = "dvn_lambda_generator"
  role             = aws_iam_role.lambda_generator_role.arn
  handler          = "lambda-generator/generator.handler"
  runtime          = "nodejs22.x"
  architectures    = ["x86_64"]
  memory_size      = 1024
  timeout          = 660

  environment {
    variables = {
      TABLE = aws_dynamodb_table.orders_table.name
    }
  }

  tags = {
    Name = "dvn_lambda_generator"
  }
}

# Configura zero tentativas de re-execução em caso de falha assíncrona
resource "aws_lambda_function_event_invoke_config" "generator_async" {
  function_name                = aws_lambda_function.generator.function_name
  maximum_retry_attempts       = 0
  maximum_event_age_in_seconds = 3600
}
