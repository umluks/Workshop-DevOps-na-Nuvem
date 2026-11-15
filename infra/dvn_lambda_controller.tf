# Lambda Controller - Responsável por orquestrar execuções e consultar status
resource "aws_lambda_function" "controller" {
  filename         = "${path.module}/build/lambda-controller.zip"
  function_name    = "dvn_lambda_controller"
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
      GENERATOR = "dvn_lambda_generator"
    }
  }

  tags = {
    Name = "dvn_lambda_controller"
  }
}

# Permissão para API Gateway invocar a Lambda Controller
resource "aws_lambda_permission" "apigw_controller" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.controller.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.orders_api.execution_arn}/*/*"
}
