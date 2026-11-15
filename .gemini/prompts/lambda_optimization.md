# Prompt Template: Análise de Cold Start e Otimização Lambda

## Objetivo
Diagnosticar gargalos de inicialização em funções AWS Lambda com base em logs de execução REPORT do CloudWatch (`Init Duration`, `Duration`, `Billed Duration`, `Max Memory Used`).

## Dados de Entrada
- Trecho de código do handler ou estrutura de importações (Node.js/Python).
- Log de métrica REPORT do CloudWatch.

## Instruções para o Modelo
1. Identificar se o tempo de `Init Duration` ultrapassa 30% do tempo total de execução.
2. Analisar importações no arquivo (`import` / `require`) e verificar se há SDKs inteiros sendo carregados ao invés de submodulos modulares (ex.: `@aws-sdk/client-dynamodb` vs `aws-sdk`).
3. Recomendar estratégias de lazy loading, ajuste de alocação de memória (que escala vCPU proporcionalmente) ou arquitetura assíncrona.
