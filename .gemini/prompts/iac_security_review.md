# Prompt Template: Revisão de Segurança e Melhores Práticas IaC (Terraform)

## Objetivo
Analisar arquivos HCL do Terraform no diretório `infra/` para identificar desvios de segurança, ausência de parâmetros recomendados e oportunidades de melhoria segundo o AWS Well-Architected Framework.

## Instruções para o Modelo
1. **Segurança (Least Privilege)**:
   - Verificar se as roles IAM em `iam.tf` contêm *wildcards* permissivos (`Action: "*"` ou `Resource: "*"`).
   - Confirmar se o bucket S3 possui criptografia em repouso (SSE-S3 ou KMS) e `public_access_block` habilitado.
2. **Resiliência e Escalabilidade**:
   - Garantir que filas SQS possuam Dead Letter Queue (DLQ) configurada para tratamento de falhas contínuas de mensagens.
   - Avaliar retenção de logs no CloudWatch (`retention_in_days`) para evitar custos infinitos de armazenamento.
3. **Formato da Saída**:
   - Resumo Executivo
   - Lista de Achados (Classificados por Gravidade: Crítica, Alta, Média, Informativa)
   - Bloco de Código HCL sugerido (antes vs. depois)
