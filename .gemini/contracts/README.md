# Contracts & Interface Schemas

Este diretório armazena os **Contratos de Interface** entre os Agentes, Ferramentas e Sistemas Externos:

- **tool_schemas/**: Esquemas JSON Schema / OpenAPI para Tool Calling e Function Calling determinísticos.
- **agent_protocols/**: Contratos de comunicação entre agentes (Multi-Agent message formats, payloads de tarefas).
- **validation/**: Regras de validação estrita de entradas e saídas (evitando saídas alucinadas ou fora de formato).

> **Objetivo**: Garantir previsibilidade, tipagem estrita e robustez nas chamadas de ferramentas e interoperabilidade MCP (Model Context Protocol).
