# Runbook: `/conta` Self-Service

End-to-end account self-service surface. Replaces legacy `/billing` and `/settings` pages.

## Routes

```
/conta                  → hub (links to all sub-pages)
/conta/perfil           → name, phone, timezone, language, avatar
/conta/senha            → change password
/conta/sessoes          → active sessions, sign out other devices
/conta/notificacoes     → channel prefs (telegram/whatsapp/email), filters, score
/conta/assinatura       → plan + invoices + cancel + UPGRADE PICKER
/conta/privacidade      → LGPD export + account deletion (14d soft-delete)
```

Legacy redirects (preserve query params):

```
/billing       → /conta/assinatura  (preserves ?success, ?canceled, ?expired, ?upgrade, ?feature, ?plan, ?billing, ?from)
/settings      → /conta
```

## Wave breakdown (history)

| Wave | Scope                                                                  |
| ---- | ---------------------------------------------------------------------- |
| 1    | `/conta` layout + hub + stubs + base migrations                        |
| 2    | Perfil + senha + sessões (phone/timezone/language/avatar + sessions RPC) |
| 3    | Assinatura: Stripe Portal + retention modal + cancel-at-period-end     |
| 4    | Privacidade: LGPD export worker + 14-day account deletion worker       |
| 5    | `/billing` + `/settings` redirects + nav rename + this runbook         |

## Critical flows

### 1. Cancelar assinatura

1. User clica "Cancelar assinatura" em `/conta/assinatura`
2. `CancelTrigger` abre `CancelModal` (retention modal com motivo + warning de perda de acesso)
3. User confirma → server action `cancelSubscription` em `apps/web/src/actions/conta/cancel-subscription.ts`
4. Stripe API `subscriptions.update({ cancel_at_period_end: true })`
5. DB `subscriptions.cancel_at_period_end = true`, `cancel_requested_at = now()`
6. Banner de "Cancelamento agendado" aparece com botão `ReactivateButton`
7. Usuário mantém acesso até `current_period_end`
8. Stripe webhook `customer.subscription.deleted` → status='canceled', perde acesso

Reativar (antes do período acabar): `ReactivateButton` chama `reactivateSubscription` → Stripe `cancel_at_period_end: false`.

### 2. Upgrade picker

Acionado quando `searchParams` em `/conta/assinatura` contém:

- `?upgrade=1` (sidebar feature-lock click)
- `?feature=<key>` (middleware bloqueio de feature)
- `?expired=1` (middleware sub expirada)
- `?canceled=1` (Stripe cancel)
- Ou usuário não tem `plan` ativo

Renderiza `<UpgradeButton>` cards. `<AutoCheckout>` ainda funciona com deep-link `?plan=slug&billing=annual` (cria sessão Stripe e redireciona).

Sidebar feature-locks: `/conta/assinatura?upgrade=1&feature=<key>&from=<orig-path>` mostra banner de feature bloqueada + lista de planos.

### 3. LGPD export (worker `data-export`)

1. User clica "Exportar meus dados" em `/conta/privacidade`
2. Server action enfileira job em `data_export_jobs`
3. Worker `apps/workers/data-export/` puxa, gera ZIP, faz upload no bucket `exports`, envia signed URL por email
4. User recebe link com TTL de 7d

### 4. Delete account (worker `account-deletion`, 14d grace)

1. User clica "Excluir conta" em `/conta/privacidade` → confirma email
2. `deletion_requests` row criada com `scheduled_for = now() + 14 days`
3. User pode cancelar a qualquer momento durante o grace period (mesma página)
4. Worker `apps/workers/account-deletion/` roda diariamente, processa requests vencidos:
   - Cancela subscription Stripe
   - Hard-delete em cascata (`auth.users` + tabelas dependentes)
   - Email de confirmação final

## Migrations aplicadas

- `users.phone, users.timezone, users.language, users.avatar_url` (Wave 2)
- bucket `avatars` + RLS (Wave 2)
- RPCs `get_user_sessions`, `revoke_user_session`, `revoke_all_other_sessions` (Wave 2)
- `subscriptions.cancel_at_period_end, subscriptions.cancel_requested_at, subscriptions.cancel_reason` (Wave 3)
- `data_export_jobs` table + bucket `exports` (Wave 4)
- `account_deletion_requests` table (Wave 4)

## Como testar manualmente

### Smoke checklist

- [ ] `/conta` carrega, sidebar mostra "Conta"
- [ ] `/conta/perfil` salva nome/telefone/avatar
- [ ] `/conta/senha` troca senha (login forçado em outras sessões)
- [ ] `/conta/sessoes` lista sessões + revoga
- [ ] `/conta/notificacoes` salva score/UFs/keywords
- [ ] `/conta/assinatura` mostra plano + faturas
- [ ] `/conta/assinatura?upgrade=1` mostra picker
- [ ] `/conta/assinatura?upgrade=1&feature=lead_engine` mostra banner azul + label correto
- [ ] `/conta/privacidade` exporta dados (recebe email com ZIP)
- [ ] `/conta/privacidade` agenda deleção 14d e permite cancelar
- [ ] `/billing` → 308 → `/conta/assinatura`
- [ ] `/billing?upgrade=1&feature=competitive_intel` → preserva todos os params
- [ ] `/settings` → 308 → `/conta`
- [ ] Sidebar feature-lock click (ex: `Espionagem Competitiva` no plano Essencial) leva direto para `/conta/assinatura?upgrade=1&feature=competitive_intel`
- [ ] Cancelar/reativar assinatura ida-volta no Stripe Portal

### Cancel/reactivate flow (Stripe sandbox)

```bash
# 1. Login como user com plano ativo
# 2. /conta/assinatura → "Cancelar assinatura"
# 3. Confirmar no modal (motivo opcional)
# 4. Verificar banner "Cancelamento agendado"
# 5. Stripe Dashboard: subscription.cancel_at_period_end = true
# 6. Clicar "Reativar assinatura"
# 7. Stripe Dashboard: subscription.cancel_at_period_end = false
```

## Hardcoded references migrated

Updated to point directly to `/conta/assinatura` (avoiding redirect roundtrip):

- `apps/web/src/config/navigation.ts` — sidebar "Plano"
- `apps/web/src/components/dashboard-sidebar.tsx` — feature-lock link
- `apps/web/src/lib/supabase/middleware.ts` — `expired=1` and `feature gating` redirects
- `apps/web/src/app/api/stripe/checkout/route.ts` — Stripe checkout success/cancel URLs
- `apps/web/src/app/(dashboard)/conta/assinatura/actions-bar.tsx` — "Mudar plano"

Other places (page-level `redirect('/billing?upgrade=true')` in feature-gated pages, `<a href="/billing">` in fraud / chat / ai-analysis components) still point to `/billing` and rely on the redirect. Safe to migrate opportunistically.

## Risk residual

- `auto-checkout` deep-link `/conta/assinatura?plan=slug` only triggers when picker is visible (`showPicker = true`). Always true when `?plan=` is set since user has no/lower plan or explicit upgrade intent. Verified.
- Plan-locked routes that do `redirect('/billing?upgrade=true')` server-side will hit `/billing` page-level redirect, costing one extra hop. Negligible UX impact.
- No FAQ/help pages exist yet — when added, link directly to `/conta/{senha,assinatura,privacidade}` instead of legacy paths.
