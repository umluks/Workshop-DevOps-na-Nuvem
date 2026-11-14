# Empacotamento dos arquivos das Lambdas
# O build do TypeScript gera os arquivos em backend/dist/
# O pacote precisa conter o handler, shared/ e as dependências node_modules/

resource "aws_lambda_function" "controller" {
  filename         = "${path.module}/build/lambda-controller.zip"
  function_name    = "${var.project_name}-controller"
  role             = aws_iam_role.lambda_controller_role.arn
  handler          = "lambda-controller/control.handler"
  runtime          = "nodejs22.x"
  architectures    = ["x86_64"]
  memory_size      = 512
  timeout          = 30

  environment {
    variables = {
      TABLE     = aws_dynamodb_table.orders_table.name
      QUEUE     = aws_sqs_queue.orders_queue.url
      DLQ       = aws_sqs_queue.orders_dlq.url
      GENERATOR = "${var.project_name}-generator"
    }
  }

  tags = {
    Name = "${var.project_name}-controller"
  }
}

resource "aws_lambda_function" "generator" {
  filename         = "${path.module}/build/lambda-generator.zip"
  function_name    = "${var.project_name}-generator"
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
    Name = "${var.project_name}-generator"
  }
}

# Configura zero tentativas de re-execução em caso de falha assíncrona
resource "aws_lambda_function_event_invoke_config" "generator_async" {
  function_name                = aws_lambda_function.generator.function_name
  maximum_retry_attempts       = 0
  maximum_event_age_in_seconds = 3600
}

resource "aws_lambda_function" "processor" {
  filename         = "${path.module}/build/lambda-processor.zip"
  function_name    = "${var.project_name}-processor"
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
    Name = "${var.project_name}-processor"
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

# Permissão para API Gateway invocar a Lambda Controller
resource "aws_lambda_permission" "apigw_controller" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.controller.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.orders_api.execution_arn}/*/*"
}
