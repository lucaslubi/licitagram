# Licitagram

Plataforma SaaS de monitoramento e inteligencia em licitacoes publicas brasileiras. Identifica oportunidades de negocio automaticamente, analisa editais com IA e conecta empresas aos processos licitatorios mais relevantes.

## Visao Geral

O Licitagram monitora portais de licitacoes (PNCP, Compras.gov, BEC-SP, Portal MG), extrai dados de editais, realiza matching inteligente com o perfil da empresa e entrega oportunidades qualificadas com score de compatibilidade.

### Principais Funcionalidades

- **Monitoramento automatizado** — Scraping de 6 fontes de licitacoes publicas a cada 4 horas
- **Matching inteligente** — Score 0-100 baseado em CNAE, palavras-chave e analise de IA
- **Chat com o Edital** — Conversa com documentos PDF do edital usando Gemini 2.5 Flash (1M de contexto)
- **Pipeline Kanban** — Gestao visual do funil de oportunidades (novo → interessado → proposta → ganhou/perdeu)
- **Inteligencia competitiva** — Monitoramento de concorrentes e resultados de pregoes
- **Compliance** — Controle de validade de certidoes e documentos habilitatorios
- **Alertas** — Notificacoes por email e Telegram para novos matches
- **Multi-tenant** — Isolamento de dados por empresa com RLS (Row-Level Security)
- **Admin** — Painel administrativo com gestao de clientes, planos e permissoes granulares
- **Exportacao** — Excel com filtros por UF, modalidade e score

## Arquitetura

```
licitagram/
├── apps/
│   └── web/                  # Next.js 14 (App Router) — Frontend + API
├── packages/
│   ├── shared/               # Tipos, schemas Zod, constantes compartilhadas
│   ├── workers/              # BullMQ workers — scrapers, matching, notificacoes
│   └── supabase/             # Config Supabase local
├── supabase/
│   └── migrations/           # 15 migracoes SQL (schema completo)
├── turbo.json                # Turbo build config
├── pnpm-workspace.yaml       # Monorepo workspaces
└── .env                      # Variaveis de ambiente
```

### Stack Tecnologico

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 14, React 18, Tailwind CSS, shadcn/ui, Radix UI |
| Backend | Next.js API Routes, Supabase (PostgreSQL + Auth + RLS) |
| IA/Chat | Google Gemini 2.5 Flash (1M contexto), NVIDIA AI |
| Workers | BullMQ + Redis, Cheerio (scraping), pdf-parse |
| Pagamentos | Stripe (checkout, webhooks, subscriptions) |
| Cache/Rate Limit | Redis (ioredis) |
| Notificacoes | Telegram (grammy), Email |
| Monorepo | pnpm + Turborepo |

## Banco de Dados

### Tabelas Principais

| Tabela | Descricao |
|--------|-----------|
| `companies` | Empresas (CNPJ, CNAE, porte, capacidades) |
| `users` | Usuarios com roles (admin/user/viewer) e permissoes |
| `plans` | Planos dinamicos com feature flags e limites |
| `subscriptions` | Assinaturas Stripe com contagem de uso |
| `tenders` | Licitacoes de todos os portais monitorados |
| `tender_documents` | PDFs dos editais com texto extraido |
| `matches` | Company x Tender com score e breakdown |
| `competitors` | Fornecedores concorrentes e propostas |
| `company_documents` | Certidoes e docs habilitatorios (validade) |
| `scraping_jobs` | Audit log de jobs de scraping |

### Seguranca

- **RLS (Row-Level Security)** em todas as tabelas — usuarios veem apenas dados da propria empresa
- **Platform Admin** — bypass de RLS para acesso global
- **Permissoes granulares** — JSONB com flags por secao do admin
- **SSRF Protection** — blocklist de IPs internos no proxy de PDF
- **Rate Limiting** — Redis sorted sets por usuario/endpoint

## Fontes de Dados (Workers)

| Fonte | Portal | Frequencia |
|-------|--------|-----------|
| PNCP | Portal Nacional de Contratacoes Publicas | 4h |
| Compras.gov | dados abertos do governo federal | 4h |
| BEC-SP | Bolsa Eletronica de Compras de Sao Paulo | 4h |
| Portal MG | Compras Minas Gerais | 4h |
| ARP | Atas de Registro de Precos (Compras.gov) | 4h |
| Legado | Sistema legado Compras.gov | 4h |

### Pipeline de Processamento

```
Scraping → Extracao de PDF → Matching (keyword + CNAE) → Notificacao
    ↓                                    ↓
Banco de dados               Score 0-100 + breakdown
```

## Planos e Precificacao

| Plano | Preco | Matches/mes | Usuarios | Features |
|-------|-------|-------------|----------|----------|
| Starter | R$ 197/mes | 50 | 1 | PNCP, Compras.gov |
| Professional | R$ 497/mes | Ilimitado | 5 | Todos portais, Chat IA, Compliance, Competitivo, Excel |
| Enterprise | R$ 997/mes | Ilimitado | Ilimitado | Multi-CNPJ, API, Gerador de propostas, Suporte prioritario |

## API Routes

| Endpoint | Metodo | Descricao |
|----------|--------|-----------|
| `/api/chat` | POST | Chat streaming com Gemini sobre documentos do edital |
| `/api/chat/upload` | POST | Upload de PDF para extracao de texto |
| `/api/chat/proxy-pdf` | GET | Proxy para download de PDFs (bypass CORS) |
| `/api/analyze` | POST | Analise IA de compatibilidade empresa x edital |
| `/api/export` | GET | Exportacao Excel com filtros |
| `/api/stripe/checkout` | POST | Criar sessao de checkout Stripe |
| `/api/stripe/webhook` | POST | Webhook Stripe (atualizacao de assinatura) |
| `/api/revalidate` | POST | Revalidacao de cache ISR |

## Setup Local

### Pre-requisitos

- Node.js 20+
- pnpm 9+
- Redis
- Conta Supabase
- Conta Stripe
- API Key do Google Gemini

### Instalacao

```bash
# Clonar o repositorio
git clone git@github.com:lucaslubi/licitagram.git
cd licitagram

# Instalar dependencias
pnpm install

# Configurar variaveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais

# Rodar migracoes do banco
pnpm --filter @licitagram/supabase db:push

# Iniciar desenvolvimento
pnpm dev
```

### Variaveis de Ambiente

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Redis
REDIS_URL=redis://localhost:6379

# IA
GEMINI_API_KEY=
NVIDIA_API_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Telegram
TELEGRAM_BOT_TOKEN=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Comandos

```bash
pnpm dev              # Iniciar app web (Next.js)
pnpm build            # Build de producao
pnpm lint             # ESLint
pnpm workers:dev      # Iniciar workers (scrapers + matching)
```

## Estrutura de Paginas

### Dashboard (/dashboard)
- Metricas: matches ativos, oportunidades, taxa de conversao
- Resumo de atividade recente

### Oportunidades (/opportunities)
- Lista de licitacoes com filtros (UF, modalidade, score, fonte, data)
- Visualizacao por matches ou todas as licitacoes
- Detalhe com score breakdown, documentos, requisitos
- **Chat com o Edital** — auto-download de PDFs + conversa com IA

### Pipeline (/pipeline)
- Kanban board com drag-and-drop
- Status: Novo → Visualizado → Interessado → Proposta Enviada → Ganhou/Perdeu

### Competidores (/competitors)
- Monitoramento de empresas concorrentes
- Historico de propostas e resultados

### Documentos (/documents)
- Upload e controle de validade de certidoes
- Alertas de vencimento (CND, FGTS, Trabalhista, etc.)

### Admin (/admin)
- Gestao de clientes, planos e usuarios
- Painel financeiro (MRR, receita, churn)
- Audit log de acoes administrativas
- Permissoes granulares por secao

## Licenca

Proprietary - Todos os direitos reservados.
