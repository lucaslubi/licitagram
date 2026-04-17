# Changelog

All notable changes to this monorepo are documented here. Format loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). LicitaGram B2B changes and LicitaGram Gov changes are tagged `[web]` and `[gov]` respectively; cross-cutting items are `[core]`.

## [Unreleased]

### Added
- `[gov]` Fase 0 bootstrap: new `apps/gov` (Next.js 14, blue DS-11 theme, stub landing), `packages/gov-core` (Drizzle + Claude wrapper), `packages/gov-workers` (BullMQ with `licitagov:` prefix).
- `[gov]` Supabase migration `20260418000000_gov_schema_init.sql` creating the `licitagov.*` schema (16 tables + `v_historico_pncp` VIEW + generic audit trigger + baseline RLS).
- `[core]` `.github/workflows/ci.yml` with `protect-licitagram-web` (RI-8) and `ri6-queue-prefix` gates.
- `[core]` ADRs 0001–0007 documenting monorepo, schema isolation, Drizzle choice, subdomain, Claude model strategy, deterministic compliance, and workers path decisions.
- `[core]` `docs/internal/architecture.md` and `docs/internal/runbooks/deploy.md`.

### Fixed
- `[web]` Rebuilt `@licitagram/shared` dist — the `bidding_bot_supreme` feature key was present in `src/types/plan.ts` but missing from the shipped `dist/types/plan.d.ts`, breaking `apps/web` type-check at `apps/web/src/app/(dashboard)/bot/api-keys/page.tsx:19`.
