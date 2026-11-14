# 🌐 Amazon CloudFront — Visão Geral & Conceito

> **Categoria:** Redes, CDN & Camada de Borda  
> **Sessão:** Arquitetura Escalável & Resiliente na AWS (Pico de Black Friday / 1M Usuários)  
> **Status:** Concluído

---

## 1. O que é o Amazon CloudFront?
O **Amazon CloudFront** é um serviço gerenciado de CDN (*Content Delivery Network* ou Rede de Distribuição de Conteúdo) da AWS. Ele distribui dados, vídeos, aplicações e APIs para usuários globais com baixa latência e alta velocidade física de transferência.

---

## 2. Analogia Didática: Centros de Distribuição Locais

- **Sem CDN (Modelo Centralizado):** Uma fábrica única localizada em São Paulo precisa despachar cada encomenda individualmente para compradores em Manaus, Lisboa ou Tóquio. Isso acarreta alto custo de frete, demora (alta latência) e congestionamento na linha de produção da fábrica.
- **Com CloudFront (Modelo Distribuído):** A fábrica cria mini-galpões e pontos de apoio locais (**Edge Locations**) nas principais metrópoles globais com os itens de maior saída guardados em estoque (**cache**). Quando o comprador finaliza o pedido, o item sai do ponto vizinho a ele, de forma praticamente instantânea, poupando a fábrica principal.

---

## 3. Como Funciona o Ciclo da Requisição (Borda & Cache)

```mermaid
flowchart TD
    User["👤 Usuário"] -->|1. Requisição HTTP/HTTPS| Edge["📍 Edge Location (Mais Próxima)"]
    Edge -->|2a. Cache Hit (Já existe local)| User
    Edge -->|2b. Cache Miss (Não existe ou expirou)| Origin["🏢 Origem (S3 / ALB / API Gateway)"]
    Origin -->|3. Resposta com dados| Edge
    Edge -->|4. Salva em Cache (respeita TTL) e entrega| User
```

### Mecânica de Cache:
- **Cache Hit:** O recurso solicitado (ex: imagem, arquivo JS/CSS) já reside na memória da *Edge Location*. A resposta é devolvida imediatamente ao cliente em poucos milissegundos, com zero consumo de computação ou rede na origem.
- **Cache Miss:** O recurso ainda não existe na borda ou seu tempo de vida (**TTL - Time To Live**) expirou. O CloudFront busca o dado na **Origem** (Amazon S3, Application Load Balancer, EC2 ou API Gateway), repassa ao usuário e armazena uma cópia local para as próximas requisições.

---

## 4. Tipos de Conteúdo Suportados

| Tipo de Conteúdo | Exemplos | Comportamento no CloudFront |
| :--- | :--- | :--- |
| **Estático** | HTML, CSS, JavaScript, imagens, fontes, PDFs, bundles React/Vue | Cache agressivo na borda com TTL longo. Economiza até 95% do tráfego na origem. |
| **Dinâmico** | APIs REST, endpoints GraphQL, submissões POST | Não cacheado por padrão, mas acelerado pelo tráfego via **AWS Global Backbone** (fibra dedicada AWS) em vez da internet pública. |
| **Streaming / Mídia** | Transmissões ao vivo e vídeo sob demanda (HLS, DASH, CMAF) | Distribuição contínua de segmentos de vídeo na borda com entrega estável e baixa latência. |

---

## 5. Benefícios para Cenários de Alta Concorrência (Black Friday / 1M Usuários)

1. **Offloading da Origem (*Absorção de Carga*):**
   - Em eventos com milhões de acessos simultâneos, a maioria das requisições acessa os mesmos ativos estáticos. O CloudFront responde na borda e blinda os servidores de aplicação contra quedas.
2. **Redução Drástica de Latência:**
   - O RTT (*Round Trip Time*) diminui consideravelmente, pois o handshake TCP/TLS e o download ocorrem no PoP (*Point of Presence*) mais próximo geograficamente do usuário.
3. **Segurança Ativa na Borda:**
   - **AWS Shield (Standard):** Proteção nativa e gratuita contra ataques de negação de serviço (DDoS) nas camadas 3 e 4.
   - **AWS WAF:** Regras de firewall para contenção de SQL Injection, Cross-Site Scripting (XSS), bots maliciosos e *Rate Limiting* por IP.
   - **Terminação TLS/SSL na Borda:** Desonera a CPU dos servidores internos da aplicação.
4. **Otimização de Custos:**
   - O tráfego de saída do Amazon S3 para o CloudFront é gratuito ($0.00 por GB), além de o custo por GB transferido pelo CloudFront para a internet ser menor do que o do S3/EC2 direto.

---

## 6. Boas Práticas Arquiteturais
- **Origin Access Control (OAC):** Configurar o bucket S3 como estritamente privado, permitindo leitura exclusivamente autenticada via identidade do CloudFront. Consulte o guia dedicado em [Origin Access Control (OAC)](oac.md).
- **Versionamento de Arquivos:** Utilizar hashes nos nomes dos bundles (`bundle.a1b2c3.js`) com cabeçalho `Cache-Control: public, max-age=31536000, immutable`, eliminando a necessidade de invalidações caras de cache.
- **Origin Shield:** Habilitar uma camada centralizada de cache intermediário se houver alta concorrência global sobre arquivos com baixa taxa de cache hit.
