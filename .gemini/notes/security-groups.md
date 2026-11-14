# 🛡️ AWS Security Groups — Firewall Stateful a Nível de Instância

> **Categoria:** Segurança, Redes e Isolamento de Tráfego  
> **Sessão:** Arquitetura Escalável & Resiliente na AWS  
> **Status:** Concluído

---

## 1. O que é um Security Group?

O **AWS Security Group** atua como um **firewall virtual** que controla o tráfego de entrada (*Inbound*) e de saída (*Outbound*) diretamente a nível de interface de rede elástica (**ENI** - *Elastic Network Interface*). 

Diferente de firewalls perimetrais ou de borda, o Security Group é associado diretamente aos recursos computacionais e gerenciados da AWS, como:
- Instâncias **Amazon EC2**
- Funções **AWS Lambda** conectadas a uma VPC
- Instâncias e clusters de banco de dados **Amazon RDS / Aurora**
- Caches gerenciados **Amazon ElastiCache**
- Balanceadores de carga **Application Load Balancers (ALB)** e **Network Load Balancers (NLB)**

```mermaid
flowchart TD
    Internet["🌐 Internet / Tráfego Externo"] --> WAF["🛡️ AWS WAF (Borda Camada 7)"]
    WAF --> ALB["⚖️ Application Load Balancer\n(SG: sg-alb)"]
    
    subgraph VPC ["VPC Privada"]
        ALB -->|Porta 80/443| EC2["🖥️ Instância EC2 / Lambda VPC\n(SG: sg-app)"]
        EC2 -->|Porta 5432 (Postgres)| RDS["🗄️ Amazon RDS Database\n(SG: sg-db)"]
    end

    classDef sg fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    class ALB,EC2,RDS sg;
```

---

## 2. Princípios Fundamentais de Funcionamento

### A. Natureza Stateful (Com Estado)
- Se você permite uma requisição de entrada (*Inbound Rule*), a resposta para essa requisição é **automaticamente autorizada a sair**, independentemente de qualquer regra de saída (*Outbound*).
- O mesmo vale para requisições de saída iniciadas pela instância: a resposta que retorna é aceita automaticamente.

### B. Negação Padrão (Implicit Deny)
- Por padrão, um Security Group recém-criado **bloqueia todo o tráfego de entrada**. Nenhuma porta ou protocolo externo consegue atingir o recurso até que uma regra explícita de permissão (*Allow Rule*) seja adicionada.
- Não existem regras de "Negação Explícita" (*Deny Rules*). Se uma conexão não der match em nenhuma regra de permissão, ela é sumariamente descartada.

### C. Segurança em Camadas: Referência de SG para SG (*Chained Security Groups*)
Uma das práticas mais recomendadas na AWS é **nunca liberar faixas de IP (CIDR)** para comunicação interna entre componentes, mas sim referenciar o ID do Security Group de origem:

| Recurso | Security Group | Regra de Entrada (Inbound) | Origem Permitida |
| :--- | :--- | :--- | :--- |
| **ALB (Público)** | `sg-alb` | HTTP (80) e HTTPS (443) | `0.0.0.0/0` (Qualquer IP da Internet) |
| **App / EC2 (Privado)** | `sg-app` | Custom TCP (8080 ou 3000) | `sg-alb` (Apenas tráfego vindo do ALB) |
| **Database / RDS (Privado)** | `sg-db` | Postgres (5432) / MySQL (3306) | `sg-app` (Apenas tráfego vindo da aplicação) |

> 💡 **Vantagem:** Se a aplicação escalar de 2 para 50 instâncias EC2, nenhuma regra no banco precisa ser alterada ou atualizada com novos IPs.

---

## 3. Comparativo: Security Group vs. Network ACL (NACL)

| Característica | Security Group | Network ACL (NACL) |
| :--- | :--- | :--- |
| **Nível de Atuação** | Interface de Rede / Instância (ENI) | Subnet (Sub-rede inteira da VPC) |
| **Comportamento de Estado** | **Stateful** (rastreia conexões abertas) | **Stateless** (avalia entrada e saída separadamente) |
| **Tipos de Regras** | Apenas regras de **Permissão (Allow)** | Regras de **Permissão (Allow) e Negação (Deny)** |
| **Ordem de Avaliação** | Todas as regras são avaliadas antes da decisão | Avaliação sequencial ordenada por número de regra |
| **Casos de Uso Típicos** | Isolamento de serviços (Web -> App -> DB) | Bloqueio perimetral de faixas de IPs maliciosos / CIDRs |

---

## 4. Análise do Diagrama do Excalidraw

No diagrama do Excalidraw, o Security Group é destacado com:
- **Alvo:** `ec2, lambda, rds...`
- **Conceito:** `Firewall a nível de instância`.
- **Regras:** Definição clara de entrada e saída.
- **Exemplo Real:** `TCP, 22 Inbound` (porta padrão de SSH para administração segura de instâncias).

> ⚠️ **Alerta de Segurança:** A porta 22 (SSH) nunca deve ficar aberta para `0.0.0.0/0`. A recomendação é restringir ao IP fixo da VPN corporativa ou preferir o uso de **AWS Systems Manager (SSM) Session Manager**, que elimina a necessidade de abrir portas de entrada no Security Group.

---

## 5. Exemplo em Terraform (Infraestrutura como Código)

```hcl
# Security Group para o Application Load Balancer
resource "aws_security_group" "alb_sg" {
  name        = "alb-security-group"
  description = "Permite trafego web HTTPS da internet"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS da Internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Saida irrestrita"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Security Group para instâncias de Aplicação / EC2
resource "aws_security_group" "app_sg" {
  name        = "app-security-group"
  description = "Permite trafego apenas vindo do ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Trafego HTTP do ALB"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```
