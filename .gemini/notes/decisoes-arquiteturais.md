# 🧠 Decisões Arquiteturais Rápidas (Micro-ADR)

Registro do histórico de escolhas técnicas, desafios e *trade-offs* adotados no projeto.

---

## Template de Decisão

```markdown
### [AAAA-MM-DD] Título da Decisão
- **Contexto:** Qual era o desafio técnico, restrição ou requisito de negócio?
- **Decisão:** O que foi escolhido e como será implementado?
- **Motivo & Trade-offs:** Quais foram os prós e contras frente às alternativas analisadas?
```

---

## Registros Ativos

### [2026-11-14] Adoção de Sharded Counters no DynamoDB para Alta Concorrência
- **Contexto:** Durante picos massivos de pedidos simultâneos (Black Friday / 1M usuários), débitos concorrentes em um único registro central de estoque causam contenção severa de escrita (*hot partition*) e falhas por concorrência otimista.
- **Decisão:** Adotar a técnica de *Sharded Counters*, particionando o estoque em 10 shards independentes mapeados para 10 `MessageGroupIds` no Amazon SQS FIFO.
- **Motivo & Trade-offs:** 
  - *Prós:* Permite paralelismo real em 10 canais sem bloqueios mútuos, garantindo débito atômico via `TransactWriteItems`.
  - *Contras:* Requer lógica de alocação de estoque na criação do teste e agregação periódica para relatórios gerenciais consolidados.
