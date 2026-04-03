# LICITAGRAM - Plano de Auditoria e Estabilizacao

**Data:** 2026-04-01 | **Atualizado:** 19:55 UTC

---

## RESUMO: 17 bugs criticos corrigidos hoje

| # | Bug | Impacto | Status |
|---|-----|---------|--------|
| 1 | overlaps fallback quebrava matching CNAE | Empresas novas ~37 matches em vez de milhares | CORRIGIDO |
| 2 | VPS_MONITORING_URL IP errado (Vercel + codigo) | Admin offline, matching nunca triggerado | CORRIGIDO |
| 3 | mirror_companies vazia no PG local | Keyword-matcher retornava 0 matches | CORRIGIDO |
| 4 | Redis NOAUTH em 16 workers (KVM4+KVM8) | Workers nao recebiam eventos pub/sub | CORRIGIDO |
| 5 | 3 subscriptions sem plan_id | Features bloqueados para 3 empresas | CORRIGIDO |
| 6 | user_companies faltando para info@zeepcode | RLS bloqueava subscription | CORRIGIDO |
| 7 | API keys ausentes no KVM4 (.env) | LLM classification 100% falhando | CORRIGIDO |
| 8 | mirror_matches sem colunas notified_at/ai_justificativa | Queries falhavam, spam de fallback | CORRIGIDO |
| 9 | mirror tables sem coluna embedding | Spam de fallback nos logs | CORRIGIDO |
| 10 | generate-profile usava Groq/Llama (limite excedido) | Geracao de descricao/keywords falhava | CORRIGIDO |
| 11 | Empresa deletada bloqueava recadastro CNPJ | Impossivel cadastrar empresa em novo perfil | CORRIGIDO |
| 12 | RLS impedia operacoes com empresas orfas | Delete/reuse de empresa falhava | CORRIGIDO |
| 13 | KVM8 Redis URL com senha errada | Workers do KVM8 sem conexao Redis | CORRIGIDO |
| 14 | RAM NaN/NaN no admin monitoring | Dashboard mostrava valores invalidos | CORRIGIDO |
| 15 | Empty IN() no db.ts Supabase path | "syntax error near )" em queries | CORRIGIDO |
| 16 | Mirror errors silenciados (.catch(() => {})) | Bugs invisíveis, sem diagnostico | CORRIGIDO |
| 17 | Comentarios DeepSeek em rotas que usam Groq | Confusao para desenvolvedores | CORRIGIDO |

---

## PENDENTE: Proximas correcoes por prioridade

### P0 - CRITICO (fazer esta semana)

1. **Subscription flow para novos usuarios**
   - Bug: saveCompany() cria subscription enterprise automaticamente
   - Fix: Novo usuario deve receber plano "trial" ou "free", enterprise apenas via Stripe
   - Arquivos: apps/web/src/actions/company.ts (saveCompany), multi-company.ts (addCompanyAction)

2. **11 API routes sem try-catch**
   - Rotas: settings/onboarding, admin/prospects/export, admin/semantic, enrichment/*, switch-company, drive/download, whatsapp/*, company/matching-status
   - Fix: Adicionar try-catch wrapper com log de erro

3. **IPs hardcoded em 12+ arquivos**
   - Fix: Centralizar VPS_MONITORING_URL, VPS_LOGIN_URL, ENRICHMENT_API_URL como env vars obrigatorias

### P1 - ALTO (fazer em 2 semanas)

4. **Mirror sync periodico**
   - Bug: mirror_companies so synca no trigger-matching
   - Fix: Cron job a cada 5 min que synca companies/matches do Supabase para PG local

5. **Circuit breaker no LLM client**
   - Bug: Thundering herd quando DeepSeek retorna 429
   - Fix: Adicionar circuit breaker pattern (aberto apos 5 falhas, tenta novamente apos 60s)

6. **Dead letter queue no BullMQ**
   - Bug: Jobs falhados desaparecem apos retry
   - Fix: Adicionar DLQ para auditoria e replay

7. **Jina rate limit throttle**
   - Bug: 100 req/min excedido quando multiplas empresas processam simultaneamente
   - Fix: Queue global de embedding com 1 req/sec

### P2 - MEDIO (fazer no proximo sprint)

8. **Type safety** - 8+ usos de `as any` em paths criticos
9. **74 chamadas .single() sem defensive check**
10. **Pool exhaustion monitoring** (localPool + Redis + Supabase)
11. **pgvector no PG local** para semantic matching sem fallback Supabase
12. **Memory management** nos while(true) loops do keyword-matcher

### P3 - BAIXO (backlog)

13. **KVM8 sem PG local** - workers usam Supabase direto
14. **Stalled job detection** customizado no BullMQ
15. **Webhook periodo hardcoded** (30 dias em vez de dados do Stripe)
16. **Worker uptime alerting** por queue

---

## INFRAESTRUTURA ATUAL

### KVM4 (85.31.60.53) - Server Principal
- 10 workers PM2 (all online)
- Redis com auth (16.5K keys, 42MB)
- PG local (170K tenders, 10 companies, 104K matches)
- Monitoring server (:3998)

### KVM8 (187.77.241.93) - Server Secundario
- 6 workers PM2 (all online)
- Redis local (151K keys)
- Evolution API (WhatsApp) via Docker
- Sem PG local (usa PG remoto do KVM4)

### Vercel (Producao)
- Next.js App Router
- Env vars: OPENROUTER_API_KEY, STRIPE keys, Supabase keys
- VPS_MONITORING_URL corrigido para KVM4

### Supabase
- 10 empresas (all "ready")
- 110K+ matches
- 190K licitacoes
- 10 subscriptions (all enterprise active)
- 6 usuarios

### AI Providers
- Workers: DeepSeek V3 (primary) -> Groq Llama 3.3 (fallback)
- Chat/Consultant: Gemini 2.5 Flash via OpenRouter (primary) -> Groq (fallback)
- Generate-profile: Gemini 2.5 Flash via OpenRouter
- Embeddings: Jina AI v3 (primary)
