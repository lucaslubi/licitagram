# Auto-Pilot — engine de disputa (Compras.gov.br)

> Atualizado pós-feedback Jaymes (29-30 abr/2026) e patches F1-F11.
> Branch: `fix/auto-lance-jaymes-feedback`.

## Visão geral

O bot da Compras.gov.br **não usa Playwright** — usa **Nexus HTTP engine**
(`packages/workers/src/bot/nexus/dispute-engine.ts`) que conversa direto
com a API REST do portal usando JWTs salvos em `bot_tokens` (cliente fez
login uma vez via bookmarklet em `/bot → Conectar Conta Gov.br`).

```
UI (apps/web)
  ↓ POST /api/bot/sessions  (F2: piso obrigatório)
  ↓ enqueue → bot-session-execute queue
  ↓
worker-main / bot-session-execute.processor
  ↓ acquireLock(sessionId) + load bot_tokens
  ↓ runNexusSession()
     ├─ acquireAccountLock(companyId:portal)         [F8]
     ├─ DisputeEngine(compraId, tokens, strategyByItem, rate)
     │    ↓ start(500ms sweep)
     │    ↓ radarSweep loop:
     │       scanRoom → processLot(item) →
     │         emCombate? + paused? + recoil + strategyByItem
     │         → evaluateBid() (strategies.cjs)
     │         → if deny: emitSkip + cancelPending     [F1]
     │         → scheduleShot(delay)
     │         → executeShot:
     │             rateLimitCheck                     [F4]
     │             paused?                            [F7]
     │             floor re-check (defesa profundidade) [F3]
     │             submitLance (HTTP)
     │             onBidPlaced / onBidRejected        [F1]
     │
     ├─ poll loop 1s (era 3s):                       [F7]
     │   ├─ refetch min_price + strategy_config      [F5]
     │   ├─ status='paused'   → engine.pause()
     │   ├─ status='active'   → engine.resume()
     │   ├─ status='cancelled' → break
     │   ├─ refresh account lock + last_heartbeat    [F9]
     │   └─ stop-loss watchdog                       [F6]
     │
     └─ finally: engine.stop() + releaseAccountLock
```

## Estados / eventos persistidos em `bot_events`

| `kind` | Quando | Payload |
|---|---|---|
| `session_started` | runner começa | `{mode, compraId}` |
| `tick` | cada sweep | `{n_items, ativos}` |
| `our_bid_ack` | submit OK | `{item, bid, fase, mercado_anterior}` |
| `our_bid_nack` | submit NACK do portal | `{item, erro, fase}` |
| `our_bid_skip` ⭐ NEW | engine não disparou | `{item, reason, mercado, chao, meu, fase}` |
| `floor_breach_prevented` ⭐ NEW | floor re-check pegou | `{item, attempted, floor, fase}` |
| `login_refresh` | JWT renovado | `{has_refresh}` |
| `strategy_updated` ⭐ NEW | F5 propagou | `{field, old, new}` |
| `session_paused` ⭐ NEW | F7 pause | `{}` |
| `session_resumed` ⭐ NEW | F7 resume | `{}` |
| `session_cancelled` ⭐ NEW | F7 cancel | `{}` |
| `stop_loss_triggered` ⭐ NEW | F6 disparou | `{item, from, to, drop_pct, window_sec}` |
| `error` | engine.onError | `{message}` |

## Reasons emitidos por `our_bid_skip` (não-exaustivo)

Vindos de `strategies.cjs` (deny):
- `chao_invalido_ou_zero` — piso ausente ou ≤ 0 (P0-1 raiz)
- `sem_referencia_mercado` — `lote.melhorValor === null`
- `tiro_cego_ja_efetuado_alvo_abatido` — fase fechada, nosso lance < mercado
- `tiro_cego_cofre_ja_atingido` — atingiu lanceFechado config
- (vários outros — ver `strategies.cjs:64+`)

Vindos do engine (rate-limit / floor):
- `rate_limit_per_minute_<N>` — F4
- `rate_limit_min_delay_<N>ms` — F4
- `floor_breach_prevented` — F3
- `paused`, `paused_at_submit` — F7
- `sem_config_ativa` — item não configurado em `bot_session_items` quando há config por item
- `bloqueio_chao` — intervaloMinimo do edital + floor incompatíveis
- `fora_de_combate`, `standby` — fora do estado de disputa
- `tiro_expirado_atraso` — drift > 6s entre schedule e execute
- `engine_parada` — engine.stop() durante delay

## Edição ao vivo (F5)

Operador chama `PATCH /api/bot/sessions/:id/strategy` com:

```json
{
  "min_price": 12.5,
  "mode": "auto_bid",
  "status": "paused",
  "strategy_config": {
    "minDelayBetweenOwnBidsMs": 5000,
    "maxBidsPerMinute": 10,
    "stopLossPct": 30,
    "stopLossWindowSec": 60
  }
}
```

Latência observada: < 1s entre PATCH (200) e `strategy_updated` em `bot_events`.

## Locks

| Lock | Onde | Escopo | TTL | Refresh |
|---|---|---|---|---|
| `bot_sessions.locked_until` | DB | sessionId | 5 min | a cada job |
| `bot:account:{companyId}:comprasgov` | Redis | conta gov.br | 6 h | a cada 5 min (F9) |

Se redis lock está tomado quando uma sessão tenta começar → 400
`account_lock_held` com `holder_session_id` no body, pra cliente cancelar
a outra antes.

## Healthcheck no enqueue (F2)

Antes de aceitar uma sessão `auto_bid`:
1. `min_price > 0` (global) **OU** `items[].piso > 0` em todos os itens
2. Caso falhe: 400 `piso_obrigatorio` com mensagem clara em PT-BR

Sem isso, `evaluateBid` retornaria deny silenciosamente em todos os items
e a sessão entraria em loop de tick infinito sem disparar (cenário
reproduzido em 9/10 sessões do Jaymes).
