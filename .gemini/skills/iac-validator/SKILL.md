---
name: iac-validator
description: "Valida integridade, sintaxe e alinhamento de segurança do código Terraform localizado em infra/."
---

# IaC Validator Skill

## Finalidade
Executar validações estáticas e auditoria estrutural no código Terraform (`infra/`), garantindo conformidade com padrões de segurança, nomes e infraestrutura como código limpa.

## Quando Utilizar
- Após qualquer alteração ou adição de arquivos `.tf` no diretório `infra/`.
- Antes de commits ou PRs para checar integridade do plano de infraestrutura.

## Procedimento de Validação
1. **Formatação**: Executar `terraform fmt -check` no diretório `infra/` para garantir aderência ao estilo canônico do Terraform.
2. **Validação Sintática**: Executar `terraform validate` dentro de `infra/` (quando inicializado).
3. **Auditoria de Menor Privilégio**:
   - Inspecionar `iam.tf` para assegurar que não existam declarações com permissão irrestrita (`*`).
   - Verificar se variáveis sensíveis possuem `sensitive = true` em `variables.tf`.
   - Garantir que buckets S3 definam bloqueio público explícito (`aws_s3_bucket_public_access_block`).
