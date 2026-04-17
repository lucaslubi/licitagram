# ADR-0004: Subdomínio `gov.licitagram.com`, não domínio novo

- **Status**: Aceito
- **Data**: 2026-04-18
- **Referências**: D-1 do master plan

## Contexto

Dois caminhos para publicar o LicitaGram Gov:

1. Domínio novo (`licitagov.com.br`, por exemplo) — branding fresco, custo DNS adicional, zero SEO herdado.
2. Subdomínio `gov.licitagram.com` — herda Domain Authority e brand equity do Licitagram, custo DNS zero.

## Decisão

Subdomínio. Motivos:

- Licitagram já tem tração no Google para termos relacionados a licitação.
- Órgãos públicos costumam confiar mais em nomes já conhecidos.
- Separação operacional ainda é completa (projetos Vercel distintos, env vars distintas, deploy pipelines independentes).

## Consequências

- Incidente reputacional em um produto afeta percepção do outro. Mitigação: branding visual diferenciado no Gov (azul) vs Licitagram (laranja).
- Cookies de sessão Supabase precisam ser configurados por subdomínio — `httponly`, `domain: .licitagram.com` só se houver SSO futuro entre os produtos (por enquanto, cookies ficam em `gov.licitagram.com` apenas).
- Headers `Strict-Transport-Security` com `includeSubDomains` herdados do apex — validar antes do primeiro deploy.
