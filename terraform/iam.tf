# ---------------------------------------------------------------------------------------------------------------------
# Role da Lambda Controller
# ---------------------------------------------------------------------------------------------------------------------
resource "aws_iam_role" "lambda_controller_role" {
  name = "${var.project_name}-controller-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "controller_basic" {
  role       = aws_iam_role.lambda_controller_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "controller_custom" {
  name = "${var.project_name}-controller-policy"
  role = aws_iam_role.lambda_controller_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:PutItem",
          "dynamodb:Query"
        ]
        Resource = aws_dynamodb_table.orders_table.arn
      },
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = aws_lambda_function.generator.arn
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:GetQueueAttributes"
        ]
        Resource = [
          aws_sqs_queue.orders_queue.arn,
          aws_sqs_queue.orders_dlq.arn
        ]
      }
    ]
  })
}

# ---------------------------------------------------------------------------------------------------------------------
# Role da Lambda Generator
# ---------------------------------------------------------------------------------------------------------------------
resource "aws_iam_role" "lambda_generator_role" {
  name = "${var.project_name}-generator-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "generator_basic" {
  role       = aws_iam_role.lambda_generator_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "generator_custom" {
  name = "${var.project_name}-generator-policy"
  role = aws_iam_role.lambda_generator_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "dynamodb:PutItem"
        Resource = aws_dynamodb_table.orders_table.arn
      }
    ]
  })
}

# ---------------------------------------------------------------------------------------------------------------------
# Role da Lambda Processor
# ---------------------------------------------------------------------------------------------------------------------
resource "aws_iam_role" "lambda_processor_role" {
  name = "${var.project_name}-processor-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "processor_basic" {
  role       = aws_iam_role.lambda_processor_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "processor_custom" {
  name = "${var.project_name}-processor-policy"
  role = aws_iam_role.lambda_processor_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:BatchGetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem"
        ]
        Resource = aws_dynamodb_table.orders_table.arn
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.orders_queue.arn
      }
    ]
  })
}

# ---------------------------------------------------------------------------------------------------------------------
# Role do API Gateway para envio direto ao SQS (Sem passar por Lambda)
# ---------------------------------------------------------------------------------------------------------------------
resource "aws_iam_role" "apigateway_sqs_role" {
  name = "${var.project_name}-apigateway-sqs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "apigateway.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "apigateway_sqs_policy" {
  name = "${var.project_name}-apigateway-sqs-policy"
  role = aws_iam_role.apigateway_sqs_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = aws_sqs_queue.orders_queue.arn
      }
    ]
  })
}
