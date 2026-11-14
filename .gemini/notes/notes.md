# 📚 Índice Geral de Anotações — Workshop DevOps na Nuvem

Este documento funciona como o índice central (hub de navegação) para todos os tópicos, anotações de estudo, diagramas e referências técnicas organizados na pasta `notes/`.

---

## 🗂️ Navegação por Tópico

| Documento | Descrição / Tópicos Abordados | Categoria |
| :--- | :--- | :--- |
| [**Amazon CloudFront**](cloudfront.md) | Visão geral, analogia didática de CDN, ciclo da requisição (Mermaid), conteúdo estático/dinâmico e boas práticas para Black Friday. | Borda & CDN |
| [**Amazon S3**](s3.md) | Armazenamento de objetos, 11 noves de durabilidade, S3 vs EBS vs EFS, classes de storage (FinOps), ciclo de vida e segurança. | Storage & Persistência |
| [**Origin Access Control (OAC)**](oac.md) | Proteção de buckets S3, OAC vs OAI, resolução de *Confused Deputy*, exemplo de Bucket Policy JSON e Terraform completo. | Segurança & S3 |
| [**AWS Amplify**](amplify.md) | Visão geral, os 3 pilares (Hosting, Backend Gen 1/Gen 2, UI Libraries), comparativo com S3+CloudFront e quando usar. | Fullstack & Hospedagem |
| [**AWS Lambda**](lambda.md) | Computação serverless FaaS, Firecracker, cold/warm start, Function URLs, Response Streaming, SnapStart, Graviton (arm64), ESM e Terraform. | Computação Serverless |
| [**Cold Start em Serverless**](cold-start.md) | Anatomia do início a frio no Lambda, microVMs Firecracker, fatores agravantes, SnapStart, Provisioned Concurrency e mitigação. | Performance & Serverless |
| [**Concorrência Provisionada**](concorrencia-provisionada.md) | Pré-aquecimento de microVMs no Lambda, eliminação de Cold Start, Application Auto Scaling, métricas CloudWatch e FinOps. | Performance & Serverless |
| [**Amazon API Gateway**](api-gateway.md) | Porta de entrada para microsserviços, fundamentos de HTTP/REST/WebSockets, throttling/rate limiting, autorizadores e integrações diretas. | Rede & APIs |
| [**Elastic Load Balancing & ALB**](alb-elastic-load-balancing.md) | Fundamentos de balanceamento de carga, família ELB (ALB, NLB, GLB, CLB), roteamento Camada 7, comparativos e Terraform completo. | Rede & Alta Disponibilidade |
| [**Usage Plans & API Keys**](usage-plan.md) | Planos de uso do API Gateway (REST), controle de taxa (*Throttling*) vs cotas (*Quota*), tiers de monetização e Terraform completo. | Governança & APIs |
| [**Amazon Cognito**](cognito.md) | Gestão de identidade, autenticação e autorização (CIAM), User Pools vs Identity Pools, JWT, MFA e integração nativa com API Gateway. | Segurança, Identidade & IAM |
| [**AWS WAF**](waf.md) | Web Application Firewall (Camada 7), inspeção de tráfego HTTP/S, mitigação de OWASP Top 10, SQLi, XSS, rate-limiting e bots. | Segurança & Aplicações |
| [**Amazon SQS**](sqs.md) | Simple Queue Service, mensageria gerenciada e desacoplamento assíncrono, filas Standard vs FIFO, Visibility Timeout, DLQ e Load Leveling. | Mensageria & Integração |
| [**Comparativo de Mensageria (SQS vs. RabbitMQ vs. Kafka vs. ELK)**](comparativo-mensageria-sqs-elk-rabbitmq-kafka.md) | Diferenças fundamentais entre Message Brokers, Event Streaming (Kafka), Filas em Memória (Redis) e a suíte de observabilidade ELK. | Mensageria & Arquitetura |
| [**Amazon CloudWatch**](cloudwatch.md) | Monitoramento e observabilidade nativa, métricas (percentis), logs (Insights), alarmes compostos, dashboards e FinOps. | Monitoramento & Observabilidade |
| [**Rolling Update (Atualização Contínua)**](rolling-update.md) | Estratégia de deploy com zero downtime, substituição incremental de pods/tarefas, maxSurge/maxUnavailable, coexistência v1/v2 e padrão Expand/Contract. | Estratégias de Deploy & DevOps |
| [**Geração de Carga Serverless**](solucao-geracao-de-carga-serverless.md) | Arquitetura do Slide 17/30: React + CloudFront + SQS FIFO + Lambda Workers + DynamoDB Single-Table (*Sharded Counters*). | Testes & Arquitetura |
| [**Sessão: Escalabilidade & Resiliência**](arquitetura-escalavel-resiliente-aws.md) | Notas da sessão de 14/11: Multi-AZ, Circuit Breaker, Rate Limiting, estratégias de banco e tolerância a falhas para 1M usuários. | Estratégia Cloud |
| [**Comandos & Snippets Úteis**](comandos-e-snippets.md) | Comandos essenciais para Git, Docker, AWS CLI e Terraform. | Operações & DevOps |
| [**Decisões Arquiteturais (Micro-ADR)**](decisoes-arquiteturais.md) | Registro histórico de escolhas técnicas, contexto e *trade-offs* (ex.: Sharded Counters no DynamoDB). | Governança Técnica |
| [**AWS Security Groups**](security-groups.md) | Firewall virtual stateful a nível de ENI/instância (EC2, RDS, Lambda VPC, ALB), regras Inbound/Outbound e encadeamento de SGs. | Segurança & Redes |

---

## 📌 Checklist do Workshop

- [x] Configurar ambiente inicial e ferramentas CLI
- [ ] Explorar pipelines de CI/CD e automações
- [ ] Implementar padrões de Agentic DevOps / AI Engineering
- [ ] Documentar lições aprendidas e melhores práticas

---

## 💡 Ideias & Insights Rápidos

> Espaço para rascunhos rápidos antes de transformar em um arquivo dedicado.

- Explorar **CloudFront Functions** para reescrita simples de URL e segurança de headers.
- Investigar **DynamoDB Streams** para projeções de saldo consolidado em tempo quase real.
