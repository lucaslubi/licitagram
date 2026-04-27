# Runbook: Auto-Healing Autônomo

> **Objetivo**: Sistema self-healing 24/7 para Licitagram, eliminando intervenção manual em incidentes recorrentes.
>
> **Script principal**: `/opt/licitagram/scripts/auto-heal.sh` no VPS1 (`187.77.241.93`)
> **Cron**: a cada 2 minutos
> **Logs**: `/var/log/licitagram/auto-heal.log` (humano) + `/var/log/licitagram/auto-heal.jsonl` (BI)
> **Estado**: `/var/lib/licitagram/auto-heal/` (stamps de cooling, contadores de falha)

---

## Os 10 Healers

### Workers básicos (herdado do auto-repair.sh)
- **workers_dead** — Reinicia workers PM2 em status `stopped/errored`.
- **workers_memory** — Reinicia worker com >400MB (memory leak).
- **redis** — Restart redis-server se PING falhar; quando memória >85%, faz XTRIM/ZREMRANGE em todas as bull queues.
- **disk_ram** — Apaga logs antigos quando disco >90%; alerta se RAM >90% ou conexões PG >40/50.

### H1 — Zombies em filas Bull (drain seguro)
- **Detection**: `LLEN bull:<q>:wait > 2000` E `LLEN bull:<q>:active == 0` por **15 ciclos consecutivos** (~30 min).
- **Ação**: Apenas em `pending-notifications` e `ai-triage` (allow-list). LTRIM seguido de log e alerta.
- **Fora da allow-list**: só alerta humano (`zombie_<q>` com instrução manual).
- **Cooldown**: 5 minutos entre drains da mesma fila.
- **Falha 2x**: alerta `drain_fail_<q>` com instrução manual.
- **Backlog real (active>0)**: alerta `backlog_<q>` informativo, sem auto-drain.

### H2 — Crash loop de worker
- **Detection**: snapshot `restart_time` do PM2 a cada ciclo; compara com snapshot de 8-12 min atrás.
- **Threshold**: >20 restarts em ~10 min.
- **Ação**: `pm2 stop <worker>` + alerta `crashloop_<name>` (não restarta — exige investigação humana).

### H3 — Processos node "rogue" (fora do PM2)
- **Detection**: `auto-heal-rogue-check.sh` lista procs `node`/`tsx` rodando código Licitagram cujo PID e ancestrais não pertencem ao PM2 God Daemon.
- **Ação**: alerta `rogue_<vps>` com instrução `ssh root@<ip> && kill -9 <pid>`.
- **Cobertura**: ambos VPS (`187.77.241.93` e `85.31.60.53`) via SSH.

### H4 — Queda no volume de notificações
- **Detection**: `count(matches WHERE notified_at > NOW()-1h)` via Supabase REST.
- **Threshold**: <5/h por 2 ciclos consecutivos.
- **Ação**: apenas alerta `notif_drop` (intervenção humana — geralmente bug em consumer).

### H5 — Queda na geração de matches
- **Detection**: `count(matches WHERE created_at > NOW()-1h)` via Supabase REST.
- **Threshold**: <50/h por 2 ciclos.
- **Ação**: `pm2 restart worker-matching` + alerta. Cooldown 30 min entre restarts.

### H6 — Rate limit prolongado em LLMs
- **Detection**: `grep -E "status: 429|rate_limit_error|too many requests"` em `/root/.pm2/logs/*-error*.log` últimos 30 min.
- **Threshold**: >100 erros.
- **Ação**: alerta `llm_ratelimit` sugerindo rotação de API key.

### H7 — Saúde do score de matches
- **Detection**: % de matches com `score < 30` na última hora (Supabase REST).
- **Threshold**: >60% dos matches têm score baixo (com volume mínimo de 50).
- **Ação**: alerta `score_low` (revisar engines / fórmula).

### H8 — Embeddings parados
- **Detection**: `count(mirror_tenders WHERE embedding IS NULL AND data_abertura > NOW())`.
- **Threshold**: >100.
- **Ação**: enfileira job `backfill-embeddings` em `bull:pgvector-matching` (cooldown 10 min). Alerta após 30 min ainda alto.

### H9 — Subscriptions expiradas (audit)
- **Detection**: count via Supabase REST de `status='trialing' AND trial_ends_at < NOW()`.
- **Ação**: PATCH bulk via REST → `status='expired'` + alerta `subs_expired`.

### H10 — Smoke test pós-deploy
- **Detection**: `curl -I https://licitagram.com/` (timeout 10s).
- **Threshold**: HTTP code 000 (timeout/DNS) ou ≥500 por 2 ciclos.
- **Ação**: alerta `smoke_fail` (sem auto-action).

---

## O que NÃO é auto-healed (precisa humano)

- Bugs de código em produção (alerta H2 dispara, mas worker fica STOPPED para análise).
- LLM rate limit prolongado (rotação manual de API key).
- Score baixo sistêmico (revisar fórmula / engines).
- Notif drop persistente (consumer bug — investigar logs).
- Smoke test 5xx (provável regressão de deploy — rollback).
- Rogue node procs (kill manual — segurança / auditoria).

---

## Operação

### Comandos rápidos (no VPS1)
```bash
auto-heal-status              # Dashboard de status
tail -f /var/log/licitagram/auto-heal.log
tail -f /var/log/licitagram/auto-heal.jsonl | jq .
```

### Pausar temporariamente
```bash
ssh root@187.77.241.93 'touch /tmp/auto-heal-disabled'
# ... fazer manutenção ...
ssh root@187.77.241.93 'rm /tmp/auto-heal-disabled'
```

### Ajustar threshold
Editar `/opt/licitagram/scripts/auto-heal.sh` — cada healer tem constantes locais:
- H1 stability: `[ "$stable_n" -lt 15 ]` (15 ciclos × 2min = 30min)
- H1 size: `[ "$LEN" -lt 2000 ]`
- H2 crash threshold: `[ "$delta" -gt 20 ]`
- H4 notif: `[ "$CNT" -lt 5 ]`
- H5 match: `[ "$CNT" -lt 50 ]`
- H6 LLM: `[ "$CNT" -gt 100 ]`
- H8 embed: `[ "$CNT" -gt 100 ]`

### Rate limit de alertas
Cada categoria de alerta limita a 1 mensagem por 30 min (`alert()` checa `$STATE_DIR/alert.<cat>.last`).
Para forçar reenvio: `rm /var/lib/licitagram/auto-heal/alert.<cat>.last`.

### Cooling de ações
Drains, restarts e enqueues têm cooldown próprio. Resetar:
```bash
rm /var/lib/licitagram/auto-heal/cool.<key>.last
```

### Logs estruturados (JSON)
```jsonl
{"ts":"2026-04-27T16:06:03Z","healer":"h5_match","action":"metric","result":"ok","before":"","after":"488"}
```
Útil para BI/dashboards futuros — basta `jq` ou ingestão num warehouse.

---

## Histórico do incidente que motivou (2026-04-27)

10 incidentes em sequência exigiram intervenção humana em poucas horas:
mapa quebrado, 189k jobs zumbis ai-triage, 748k zumbis pending-notifications, retorno mesmo dia, bot session puppeteer, worker-alerts crash loop 501x, score collision, score keyword quebrada, alarme falso embeddings, notif drop ~1/h.

Cada um virou um healer (H1-H10). Meta: dono não precisa mais "vir aqui pedir pra disparar".

---

## Coexistência com agentes externos

- O healer H1 substitui o `zombie-monitor.sh` standalone (cron antigo `* * * * *`).
- O healer geral substitui `auto-repair.sh`. O arquivo antigo permanece em disco (não removido) caso precise rollback.
- Para rollback: `crontab -e` e voltar a chamar `auto-repair.sh`.
