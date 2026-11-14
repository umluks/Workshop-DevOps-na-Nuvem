# ---------------------------------------------------------------------------------------------------------------------
# API Gateway REST API
# ---------------------------------------------------------------------------------------------------------------------
resource "aws_api_gateway_rest_api" "orders_api" {
  name        = "${var.project_name}-api"
  description = "API REST de Alta Vazao para Black Friday"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  api_key_source = "HEADER"
}

# ---------------------------------------------------------------------------------------------------------------------
# Recursos da API: /runs, /runs/{runId}, /orders, /orders/batch
# ---------------------------------------------------------------------------------------------------------------------
resource "aws_api_gateway_resource" "runs" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  parent_id   = aws_api_gateway_rest_api.orders_api.root_resource_id
  path_part   = "runs"
}

resource "aws_api_gateway_resource" "run_id" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  parent_id   = aws_api_gateway_resource.runs.id
  path_part   = "{runId}"
}

resource "aws_api_gateway_resource" "orders" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  parent_id   = aws_api_gateway_rest_api.orders_api.root_resource_id
  path_part   = "orders"
}

resource "aws_api_gateway_resource" "batch" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  parent_id   = aws_api_gateway_resource.orders.id
  path_part   = "batch"
}

# ---------------------------------------------------------------------------------------------------------------------
# Métodos Proxy para Lambda Controller: POST /runs, GET /runs, GET /runs/{runId}
# ---------------------------------------------------------------------------------------------------------------------

# POST /runs
resource "aws_api_gateway_method" "post_runs" {
  rest_api_id      = aws_api_gateway_rest_api.orders_api.id
  resource_id      = aws_api_gateway_resource.runs.id
  http_method      = "POST"
  authorization    = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "post_runs_integration" {
  rest_api_id             = aws_api_gateway_rest_api.orders_api.id
  resource_id             = aws_api_gateway_resource.runs.id
  http_method             = aws_api_gateway_method.post_runs.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.controller.invoke_arn
}

# GET /runs
resource "aws_api_gateway_method" "get_runs" {
  rest_api_id      = aws_api_gateway_rest_api.orders_api.id
  resource_id      = aws_api_gateway_resource.runs.id
  http_method      = "GET"
  authorization    = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "get_runs_integration" {
  rest_api_id             = aws_api_gateway_rest_api.orders_api.id
  resource_id             = aws_api_gateway_resource.runs.id
  http_method             = aws_api_gateway_method.get_runs.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.controller.invoke_arn
}

# GET /runs/{runId}
resource "aws_api_gateway_method" "get_run_id" {
  rest_api_id      = aws_api_gateway_rest_api.orders_api.id
  resource_id      = aws_api_gateway_resource.run_id.id
  http_method      = "GET"
  authorization    = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "get_run_id_integration" {
  rest_api_id             = aws_api_gateway_rest_api.orders_api.id
  resource_id             = aws_api_gateway_resource.run_id.id
  http_method             = aws_api_gateway_method.get_run_id.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.controller.invoke_arn
}

# ---------------------------------------------------------------------------------------------------------------------
# Integração Direta com SQS: POST /orders (SendMessage)
# ---------------------------------------------------------------------------------------------------------------------
resource "aws_api_gateway_method" "post_orders" {
  rest_api_id      = aws_api_gateway_rest_api.orders_api.id
  resource_id      = aws_api_gateway_resource.orders.id
  http_method      = "POST"
  authorization    = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "post_orders_sqs" {
  rest_api_id             = aws_api_gateway_rest_api.orders_api.id
  resource_id             = aws_api_gateway_resource.orders.id
  http_method             = aws_api_gateway_method.post_orders.http_method
  integration_http_method = "POST"
  type                    = "AWS"
  credentials             = aws_iam_role.apigateway_sqs_role.arn
  uri                     = "arn:aws:apigateway:${var.aws_region}:sqs:path/${data.aws_caller_identity.current.account_id}/${aws_sqs_queue.orders_queue.name}"
  passthrough_behavior    = "NEVER"

  request_parameters = {
    "integration.request.header.Content-Type" = "'application/x-www-form-urlencoded'"
  }

  request_templates = {
    "application/json" = "Action=SendMessage&MessageBody=$util.urlEncode($input.body)&MessageGroupId=$util.urlEncode($input.path(\"$.runId\"))-$util.urlEncode($input.path(\"$.shard\"))&MessageDeduplicationId=$util.urlEncode($input.path(\"$.orderId\"))"
  }
}

resource "aws_api_gateway_method_response" "post_orders_202" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  resource_id = aws_api_gateway_resource.orders.id
  http_method = aws_api_gateway_method.post_orders.http_method
  status_code = "202"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "post_orders_202_integration" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  resource_id = aws_api_gateway_resource.orders.id
  http_method = aws_api_gateway_method.post_orders.http_method
  status_code = aws_api_gateway_method_response.post_orders_202.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }

  response_templates = {
    "application/json" = "{\"accepted\":true}"
  }

  depends_on = [aws_api_gateway_integration.post_orders_sqs]
}

# ---------------------------------------------------------------------------------------------------------------------
# Integração Direta com SQS: POST /orders/batch (SendMessageBatch)
# ---------------------------------------------------------------------------------------------------------------------
resource "aws_api_gateway_method" "post_batch" {
  rest_api_id      = aws_api_gateway_rest_api.orders_api.id
  resource_id      = aws_api_gateway_resource.batch.id
  http_method      = "POST"
  authorization    = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "post_batch_sqs" {
  rest_api_id             = aws_api_gateway_rest_api.orders_api.id
  resource_id             = aws_api_gateway_resource.batch.id
  http_method             = aws_api_gateway_method.post_batch.http_method
  integration_http_method = "POST"
  type                    = "AWS"
  credentials             = aws_iam_role.apigateway_sqs_role.arn
  uri                     = "arn:aws:apigateway:${var.aws_region}:sqs:path//"
  passthrough_behavior    = "NEVER"

  request_parameters = {
    "integration.request.header.Content-Type" = "'application/x-amz-json-1.0'"
    "integration.request.header.X-Amz-Target" = "'AmazonSQS.SendMessageBatch'"
  }

  request_templates = {
    "application/json" = <<EOF
{
  "QueueUrl": "${aws_sqs_queue.orders_queue.url}",
  "Entries": [
#foreach($order in $input.path('$.orders'))
  #set($path = "$.orders[$foreach.index]")
  #set($runId = $order.runId)
  #set($shard = $order.shard)
    {
      "Id": "$foreach.index",
      "MessageBody": "$util.escapeJavaScript($input.json($path)).replaceAll("\\'","'")",
      "MessageGroupId": "$${runId}-$${shard}",
      "MessageDeduplicationId": "$order.orderId"
    }#if($foreach.hasNext),#end
#end
  ]
}
EOF
  }
}

resource "aws_api_gateway_method_response" "post_batch_200" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  resource_id = aws_api_gateway_resource.batch.id
  http_method = aws_api_gateway_method.post_batch.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "post_batch_200_integration" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  resource_id = aws_api_gateway_resource.batch.id
  http_method = aws_api_gateway_method.post_batch.http_method
  status_code = aws_api_gateway_method_response.post_batch_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }

  response_templates = {
    "application/json" = "$input.body"
  }

  depends_on = [aws_api_gateway_integration.post_batch_sqs]
}

# ---------------------------------------------------------------------------------------------------------------------
# CORS (OPTIONS) nos 4 recursos
# ---------------------------------------------------------------------------------------------------------------------
# /runs OPTIONS
resource "aws_api_gateway_method" "options_runs" {
  rest_api_id   = aws_api_gateway_rest_api.orders_api.id
  resource_id   = aws_api_gateway_resource.runs.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_runs_integration" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  resource_id = aws_api_gateway_resource.runs.id
  http_method = aws_api_gateway_method.options_runs.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_runs_200" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  resource_id = aws_api_gateway_resource.runs.id
  http_method = aws_api_gateway_method.options_runs.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "options_runs_200_integration" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  resource_id = aws_api_gateway_resource.runs.id
  http_method = aws_api_gateway_method.options_runs.http_method
  status_code = aws_api_gateway_method_response.options_runs_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Api-Key,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.options_runs_integration]
}

# /runs/{runId} OPTIONS
resource "aws_api_gateway_method" "options_run_id" {
  rest_api_id   = aws_api_gateway_rest_api.orders_api.id
  resource_id   = aws_api_gateway_resource.run_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_run_id_integration" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  resource_id = aws_api_gateway_resource.run_id.id
  http_method = aws_api_gateway_method.options_run_id.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_run_id_200" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  resource_id = aws_api_gateway_resource.run_id.id
  http_method = aws_api_gateway_method.options_run_id.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "options_run_id_200_integration" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  resource_id = aws_api_gateway_resource.run_id.id
  http_method = aws_api_gateway_method.options_run_id.http_method
  status_code = aws_api_gateway_method_response.options_run_id_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Api-Key,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.options_run_id_integration]
}

# /orders OPTIONS
resource "aws_api_gateway_method" "options_orders" {
  rest_api_id   = aws_api_gateway_rest_api.orders_api.id
  resource_id   = aws_api_gateway_resource.orders.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_orders_integration" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  resource_id = aws_api_gateway_resource.orders.id
  http_method = aws_api_gateway_method.options_orders.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_orders_200" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  resource_id = aws_api_gateway_resource.orders.id
  http_method = aws_api_gateway_method.options_orders.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "options_orders_200_integration" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  resource_id = aws_api_gateway_resource.orders.id
  http_method = aws_api_gateway_method.options_orders.http_method
  status_code = aws_api_gateway_method_response.options_orders_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Api-Key,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.options_orders_integration]
}

# /orders/batch OPTIONS
resource "aws_api_gateway_method" "options_batch" {
  rest_api_id   = aws_api_gateway_rest_api.orders_api.id
  resource_id   = aws_api_gateway_resource.batch.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_batch_integration" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  resource_id = aws_api_gateway_resource.batch.id
  http_method = aws_api_gateway_method.options_batch.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_batch_200" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  resource_id = aws_api_gateway_resource.batch.id
  http_method = aws_api_gateway_method.options_batch.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "options_batch_200_integration" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id
  resource_id = aws_api_gateway_resource.batch.id
  http_method = aws_api_gateway_method.options_batch.http_method
  status_code = aws_api_gateway_method_response.options_batch_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Api-Key,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.options_batch_integration]
}

# ---------------------------------------------------------------------------------------------------------------------
# Deploy do Stage 'live'
# ---------------------------------------------------------------------------------------------------------------------
resource "aws_api_gateway_deployment" "api_deployment" {
  rest_api_id = aws_api_gateway_rest_api.orders_api.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.runs.id,
      aws_api_gateway_resource.orders.id,
      aws_api_gateway_resource.batch.id,
      aws_api_gateway_method.post_runs.id,
      aws_api_gateway_method.get_runs.id,
      aws_api_gateway_method.get_run_id.id,
      aws_api_gateway_method.post_orders.id,
      aws_api_gateway_method.post_batch.id,
      aws_api_gateway_integration.post_runs_integration.id,
      aws_api_gateway_integration.post_orders_sqs.id,
      aws_api_gateway_integration.post_batch_sqs.id,
      aws_api_gateway_gateway_response.response_4xx.id,
      aws_api_gateway_gateway_response.response_5xx.id
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_api_gateway_integration_response.post_orders_202_integration,
    aws_api_gateway_integration_response.post_batch_200_integration
  ]
}

resource "aws_api_gateway_stage" "live_stage" {
  deployment_id = aws_api_gateway_deployment.api_deployment.id
  rest_api_id   = aws_api_gateway_rest_api.orders_api.id
  stage_name    = "live"
}

# ---------------------------------------------------------------------------------------------------------------------
# API Key & Usage Plan (2.500 req/s, Burst 500)
# ---------------------------------------------------------------------------------------------------------------------
resource "aws_api_gateway_api_key" "orders_key" {
  name        = "${var.project_name}-key"
  description = "Chave de acesso da aplicacao web e geradores"
  enabled     = true
}

resource "aws_api_gateway_usage_plan" "orders_usage_plan" {
  name        = "${var.project_name}-usage-plan"
  description = "Plano de uso calibrado para testes de carga"

  api_stages {
    api_id = aws_api_gateway_rest_api.orders_api.id
    stage  = aws_api_gateway_stage.live_stage.stage_name
  }

  throttle_settings {
    rate_limit  = 2500
    burst_limit = 500
  }
}

resource "aws_api_gateway_usage_plan_key" "main_usage_plan_key" {
  key_id        = aws_api_gateway_api_key.orders_key.id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.orders_usage_plan.id
}
