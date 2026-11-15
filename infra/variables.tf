variable "aws_region" {
  description = "Região AWS onde os recursos serão provisionados"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefixo padrão para nomeação de recursos"
  type        = string
  default     = "dvn"
}

variable "shards_count" {
  description = "Quantidade de shards para partição de estoque e grupos FIFO"
  type        = number
  default     = 1024
}
