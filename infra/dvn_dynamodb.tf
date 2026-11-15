# Tabela DynamoDB para controle de execuções, inventário particionado e pedidos
resource "aws_dynamodb_table" "orders_table" {
  name         = "${var.project_name}_dynamodb_orders"
  billing_mode = "PAY_PER_REQUEST" # On-demand: custo zero quando ocioso
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = false
  }

  tags = {
    Name = "${var.project_name}_dynamodb_orders"
  }
}
