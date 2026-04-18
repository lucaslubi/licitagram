# Changelog

All notable changes to this monorepo are documented here. Format loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). LicitaGram B2B changes and LicitaGram Gov changes are tagged `[web]` and `[gov]` respectively; cross-cutting items are `[core]`.

## [Unreleased]

### Added
- `[gov]` Fase 2: Onboarding wizard ponta-a-ponta.
  - **Migration `20260418010000_gov_phase2_onboarding.sql`**: helper `licitagov.current_orgao_id()` (SECURITY DEFINER, evita recursão RLS), reescrita das policies SELECT pra usar o helper, INSERT/UPDATE policies em `usuarios` (id = auth.uid()), RPC `licitagov.bootstrap_orgao(...)` que cria órgão idempotente por CNPJ + linka usuário em transação atômica, RPC `licitagov.get_current_profile()` que retorna user+órgão em 1 query.
  - **`lib/cnpj/lookup.ts`**: lookup BrasilAPI (sem auth, free, ~10/min/IP), validação de check-digits Modulo 11, timeout 8s, erros classificados.
  - **`lib/utils/natureza-juridica.ts`**: tabela de Natureza Jurídica RFB → `(esfera, poder)` cobrindo executivo/legislativo/judiciário federal/estadual/municipal + autarquias/fundações/empresas estatais.
  - **`lib/auth/profile.ts`**: `getCurrentProfile()` cached por request, `hasCompletedOnboarding()` boolean check.
  - **`lib/onboarding/actions.ts`**: `lookupCnpjAction` + `completeOnboardingAction` (chama RPC + dispara welcome email fire-and-forget + redirect server-side).
  - **`lib/email/welcome.ts`**: Resend, template HTML inline com CTA dinâmico baseado no objetivo escolhido. Falha-aberta se RESEND_API_KEY ausente.
  - **`/onboarding` (route group `(onboarding)`)**: wizard de 4 passos (CNPJ → Órgão → Perfil → Objetivo) com Stepper visual, autofocus, Enter-to-continue, formatação CNPJ on-the-fly, manual override pra órgãos não reconhecidos como públicos, PostHog capture em cada passo + lookup result.
  - **`middleware.ts`**: gate de onboarding — usuário autenticado sem `licitagov.usuarios.orgao_id` é redirecionado pra `/onboarding`. `/mfa` e `/onboarding` ficam acessíveis nesse limbo.
  - **`(app)/layout.tsx`**: agora carrega profile real via `getCurrentProfile()` (chama RPC `get_current_profile`), passa órgão pro `AppHeader` (mostra chip com nome + esfera + UF), monta `<PostHogIdentify>` com user.id + group por orgao_id.
  - **`components/auth/GoogleButton.tsx` + `(auth)/login` + `(auth)/cadastro`**: paridade B2B com Sign in with Google.

### Fixed
- `[gov]` Phase 2: CNPJ lookup tinha um único provider (BrasilAPI). Vercel datacenter IPs sofrem 403 frequentes. **Adicionado fallback ReceitaWS** + escape "preencher manualmente" no step 1 do wizard pra desbloquear quando ambos providers falham.
- `[gov]` Phase 2: RPCs `bootstrap_orgao` e `get_current_profile` foram criadas em `licitagov` schema, mas `supabase.rpc()` resolve via `public` por default. **Migration `20260418020000_gov_phase2_rpc_to_public.sql`** move as funções pra `public` (mantém SECURITY DEFINER acessando `licitagov.*` internamente). Helper `licitagov.current_orgao_id()` fica em `licitagov` por ser usado só pelas RLS policies.

### Deferred (escopo Phase 2 que mora em outras fases)
- Stripe trial 30d sem cartão — depende de Stripe Products configurados; entra junto com billing real (Phase 4 ou dedicada).
- Sugestão de setores baseada em histórico PNCP — depende de UI de setores (`/configuracoes/setores`) que vem com PCA Collector (Phase 3).
- Convite de equipe via email — vem com `/configuracoes/equipe` (Phase 3 ou dedicada).
- Playwright E2E — entra com pass de testes consolidado depois de Phase 3.

- `[gov]` Fase 1 [1.4]: Auth flow + MFA TOTP + rate limit Upstash.
  - `lib/auth/actions.ts`: server actions signIn/signUp/signOut/forgotPassword/resetPassword/mfaChallenge com Zod validation, rate limit por ação+IP (5 req/60s).
  - `lib/auth/mfa.ts`: enrollment helpers (start, verify, unenroll) usando supabase.auth.mfa.
  - `lib/validations/auth.ts`: Zod schemas (senha mínima 12 chars, código MFA 6 dígitos).
  - `lib/rate-limit.ts`: Upstash sliding window com fallback no-op em dev (warning em prod se vars faltam).
  - `(auth)/layout.tsx`: split layout (form esquerda, testimonial direita).
  - `(auth)/login`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha`, `/mfa`: páginas e formulários client com react-hook-form + zodResolver, toast errors, loading states.
  - `api/auth/callback/route.ts`: PKCE exchange para email confirmation e OAuth.
  - `(app)/configuracoes/seguranca`: enrollment MFA com QR (img data-url) + secret manual + verify.
  - `components/ui/form.tsx` + `checkbox.tsx`: primitivos para react-hook-form.
  - `lib/supabase/middleware.ts`: redirects anon → /login (com `?next=`), authed → /dashboard se já em /login, gate aal2 redireciona /mfa.
  - `(app)/layout.tsx`: agora server component que pega user real via createClient e passa pro AppHeader; defense-in-depth `if (!user) redirect('/login')`.
  - UserMenu e CommandPalette Sair: chamam signOutAction (server) ao invés de stub.

- `[gov]` Fase 1 partial (1.1 + 1.2 + 1.3 + 1.5): Design System + App Shell + Command Palette.
  - `components/ui/`: 13 primitivos shadcn-like (button, input, label, card, badge, skeleton, separator, dialog, sheet, dropdown-menu, command, avatar, tooltip, popover) com tokens DS-11.
  - `components/shared/`: StatusBadge, ComplianceChip, CitationCard, EmptyState, LoadingCard, AIStreamCard — primitivos de domínio que aparecem em todo artefato gerado.
  - `components/app/`: Logo, AppSidebar, MobileNav (sheet drawer), AppHeader (sticky com search trigger), UserMenu (avatar + dropdown), ThemeToggle (light/dark/system), CommandPalette (Cmd+K global, ações + navegação + tema).
  - `components/providers.tsx`: QueryClient + ThemeProvider + TooltipProvider + Sonner Toaster, único client boundary do root layout.
  - `app/(app)/layout.tsx`: shell autenticado (sidebar 256px + header sticky + main scrollable + CommandPalette portal). Mobile: sidebar colapsa em sheet drawer.
  - `app/(app)/dashboard/page.tsx`: dashboard inicial com KPIs (zeros até Phase 3+), próxima ação via EmptyState com caminho dourado, e seção preview dos componentes shared.
  - `lib/constants/navigation.ts`: registry único de NavItem (label, href, icon, shortcut) consumido por sidebar, mobile nav e command palette — fonte única da verdade.
  - Auth (1.4), Storybook (1.6) e testes unit (1.7) ficam para sessões subsequentes.

- `[gov]` Fase 0 bootstrap: new `apps/gov` (Next.js 14, blue DS-11 theme, stub landing), `packages/gov-core` (Drizzle + Claude wrapper), `packages/gov-workers` (BullMQ with `licitagov:` prefix).
- `[gov]` Supabase migration `20260418000000_gov_schema_init.sql` creating the `licitagov.*` schema (16 tables + `v_historico_pncp` VIEW + generic audit trigger + baseline RLS).
- `[core]` `.github/workflows/ci.yml` with `protect-licitagram-web` (RI-8) and `ri6-queue-prefix` gates.
- `[core]` ADRs 0001–0007 documenting monorepo, schema isolation, Drizzle choice, subdomain, Claude model strategy, deterministic compliance, and workers path decisions.
- `[core]` `docs/internal/architecture.md` and `docs/internal/runbooks/deploy.md`.

### Fixed
- `[web]` Rebuilt `@licitagram/shared` dist — the `bidding_bot_supreme` feature key was present in `src/types/plan.ts` but missing from the shipped `dist/types/plan.d.ts`, breaking `apps/web` type-check at `apps/web/src/app/(dashboard)/bot/api-keys/page.tsx:19`.
