# Monitor de Pregões — Arquitetura

## Visão Geral

Monitoramento em tempo real do chat do pregoeiro em portais de licitação. MVP: apenas Compras.gov.br.

## Stack

- **Scraping**: Playwright + playwright-extra + stealth plugin
- **Workers**: BullMQ (poll, classify, test-login)
- **Classificação IA**: callLLM() existente (Groq/Gemini/OpenRouter) + Zod validation
- **Criptografia**: sodium-native (XSalsa20-Poly1305) via PREGAO_CREDENTIALS_MASTER_KEY
- **Notificações**: Evolution API (WhatsApp) via wrapper existente
- **Realtime**: Supabase broadcast channels
- **UI**: Next.js App Router + shadcn/ui

## Arquitetura de Workers

```
packages/workers/src/pregao-chat-monitor/
├── adapters/           — Interface + implementations por portal
├── lib/                — Crypto, hash, browser pool, notificações
├── processors/         — Workers BullMQ
└── queues/             — Definição das filas
```

Rodar isolado: `node dist/index.js --queues=pregao-chat`

## Seletores DOM

Arquivo: `adapters/selectors/comprasgov.yaml`

Hot-fixável sem recompilar — edite e reinicie o worker. Seletores SERÃO refinados após primeiro teste real com o portal.

## Env Vars Necessárias

- `PREGAO_CREDENTIALS_MASTER_KEY` — 32 bytes hex (64 chars). Gerar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `WAHA_URL`, `WAHA_API_KEY`, `WAHA_SESSION` — Evolution API (já existentes)
- `REDIS_URL` — BullMQ (já existente)

## Limites por Plano

| Plano | Acesso | Monitores simultâneos |
|-------|--------|----------------------|
| Starter | Bloqueado | 0 |
| Professional | Liberado | 3 |
| Enterprise | Liberado | Ilimitado |

## Pontos de Atenção Operacional

1. **Seletores mudam sem aviso** — monitorar erros de extração nos logs
2. **Certificado A1 pode ser obrigatório** — schema suporta, adapter precisa testar
3. **MFA do gov.br bloqueia** — cliente precisa desabilitar ou usar certificado A1
4. **Rate limit: 4s mínimo** entre navegações no mesmo portal
5. **Após 5 erros consecutivos** o monitoramento é pausado automaticamente
6. **VPS 32GB aguenta ~40-60 pregões** simultâneos em polling de 5s
