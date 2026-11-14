# 🏛️ Sessão: Arquitetura Escalável & Resiliente na AWS (1M Usuários / Black Friday)

> **Data:** 14/11/2026  
> **Tema Central:** Estratégias de Infraestrutura na Nuvem para Picos de Tráfego Massivos

---

## 1. Cronograma da Sessão

- 🕤 **09:30** — Início: Arquitetura Escalável e Resiliente na AWS
- 🍽️ **12:30** — Intervalo de Almoço
- 🛠️ **14:00** — Prática e Validação do Desenho

---

## 2. Pilares de Arquitetura Escalável (até 1M Usuários)

1. **Camadas de Cache Multinível:**
   - **Borda:** [Amazon CloudFront](cloudfront.md) para absorver arquivos estáticos e acelerar chamadas de API.
   - **Aplicação/Dados:** Amazon ElastiCache (Redis) para dados de sessão, catálogos e consultas frequentes com baixa volatilidade.
2. **Computação Stateless:**
   - Utilização de containers (ECS Fargate ou EKS) ou funções serverless (AWS Lambda) combinados com políticas agressivas de Auto Scaling.
   - Nenhum estado de sessão é armazenado na memória da instância; sessões são externalizadas no Redis ou validadas via JWT.
3. **Desacoplamento Assíncrono:**
   - Mecanismos de buffer e filas de mensagens com **Amazon SQS** e barramento de eventos com **Amazon EventBridge** / **SNS** para absorver rajadas (*load leveling*).

---

## 3. Pilares de Arquitetura Resiliente

1. **Topologia Multi-AZ:**
   - Balanceamento entre pelo menos 2 a 3 Zonas de Disponibilidade (AZs) para tolerância automática a falhas de hardware ou data centers.
2. **Padrões de Resiliência de Aplicação:**
   - **Circuit Breaker:** Evita degradação em cascata quando um serviço downstream falha.
   - **Rate Limiting & Throttling:** Proteção de endpoints sensíveis (checkout, login) através do AWS WAF e políticas de throttling no API Gateway.
   - **Retry com Exponential Backoff e Jitter:** Evita que clientes retentando conexões ao mesmo tempo causem um efeito de "avalanche" (*thundering herd*).
3. **Estratégias de Failover:**
   - Roteamento inteligente com Amazon Route 53 (Health Checks + Failover Routing).
   - Grupos de origem com failover automático no CloudFront.

---

## 4. Decisões Iniciais & Dimensionamento de Banco de Dados

- **Relacional vs. NoSQL:**
  - Aplicações transacionais relacionais: Amazon Aurora Serverless v2 ou Aurora com Read Replicas distribuídas por AZs.
  - Alta concorrência de escrita com particionamento: Amazon DynamoDB com *Sharded Counters* e capacidade provisionada ou On-Demand com auto-scaling calibrado.
- **Validação com Testes de Carga:**
  - Consulte o detalhamento da [Solução Customizada para Geração de Carga Serverless](solucao-geracao-de-carga-serverless.md).
