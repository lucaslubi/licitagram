# Licitagram

Plataforma SaaS de inteligencia em licitacoes publicas brasileiras.

## Sobre

O Licitagram ajuda empresas a encontrar, analisar e competir em licitacoes publicas de forma inteligente. A plataforma automatiza o monitoramento de portais governamentais e entrega oportunidades qualificadas com base no perfil de cada empresa.

## Stack

- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Monorepo**: pnpm + Turborepo

## Estrutura

```
licitagram/
├── apps/web/           # Aplicacao web
├── packages/
│   ├── shared/         # Tipos e schemas compartilhados
│   ├── workers/        # Processamento em background
│   └── supabase/       # Configuracao do banco
└── supabase/migrations/
```

## Setup

```bash
pnpm install
cp .env.example .env
pnpm dev
```

## Comandos

```bash
pnpm dev           # Desenvolvimento
pnpm build         # Build de producao
pnpm lint          # Linting
pnpm workers:dev   # Workers locais
```

## Licenca

Proprietary - Todos os direitos reservados.
