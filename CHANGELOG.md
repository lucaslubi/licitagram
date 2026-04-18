# Changelog

All notable changes to this monorepo are documented here. Format loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). LicitaGram B2B changes and LicitaGram Gov changes are tagged `[web]` and `[gov]` respectively; cross-cutting items are `[core]`.

## [Unreleased]

### Added
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
