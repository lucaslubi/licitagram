# Investigação: qualidade dos embeddings no matching

Auditoria read-only — 2026-04-24. Hipótese inicial: e5 sem prefixos `query:`/`passage:`. **Hipótese REJEITADA pelos dados.** Causas reais identificadas abaixo.

## 1. Setup atual

- **Modelo ATIVO**: `voyage-3` (Voyage AI), 1024 dims. Confirmado via `/opt/licitagram/.env` no VPS — `VOYAGE_API_KEY` presente, primeira opção da cadeia.
- **Cadeia de fallback**: Voyage → Jina v5 (`jina-embeddings-v5-text-small`, task `text-matching`) → Ollama BGE-M3 → OpenAI `text-embedding-3-small`. Arquivo: `/Users/lucasdelima/Desktop/licitagram/packages/workers/src/ai/embedding-client.ts`.
- **Hospedagem**: Voyage cloud (api.voyageai.com).
- **Prefixo empresa**: NENHUM — `input_type: 'document'` (linha 110 de `embedding-client.ts`).
- **Prefixo tender**: NENHUM — mesma chamada, mesmo `input_type: 'document'`.
- **Dimensão coluna**: `VECTOR(1024)` em `tenders.embedding` e `companies.embedding` (migrations `20260316400000_vector_embeddings.sql` e `20260421000000_pgvector_matching_engine.sql`).
- **Normalização**: ✅ confirmado norm = 1.000 nas vetores Voyage retornadas (medido).
- **Índice**: HNSW `vector_cosine_ops` (m=16, ef_construction=128). Sem ef_search custom — usa default (40).

⚠️ **Discrepância grave entre código e SQL/comentários**: a migration `20260421000000_pgvector_matching_engine.sql` (linha 59) diz "TEI multilingual-e5-large roda no VPS (85.31.60.53:8081)". Existe um cliente `embed()` em `packages/gov-core/src/ai/embeddings.ts` que SIM faz `query:`/`passage:` para e5 — mas é usado APENAS pelo módulo `gov` (knowledge base), NÃO pelo matching de companies × tenders. O matching usa Voyage. Os comentários SQL estão desatualizados.

⚠️ **Coluna `score_semantic` em `matches` está sempre NULL**: a migration nova define a coluna mas o `semantic-matcher.ts` não popula. RPCs `match_companies_for_tender`/`match_tenders_for_company` definidas mas não chamadas pelo worker ativo (que usa o RPC antigo `match_tenders_by_embedding`).

## 2. Texto de entrada

| Lado | n amostras | tamanho médio (chars) | observações |
|---|---|---|---|
| `companies.company_profile_text` | 3 | **5628** (753, 5768, 10363) | gerado por `buildExpandedProfile` |
| `tenders.objeto` | 3 | **153** | curto |
| `tenders.resumo` | 3 amostras | **0** sempre | nunca preenchido |
| Razão profile/tender | — | **~30–60×** | desbalanço extremo |

**Problema de qualidade do profile** (amostra SPACEAPPS, id `24cdf940...`):

```
CNAE 6201501: Atividades dos Serviços de TI — Desenvolvimento de programas...
CNAE 6201502: Atividades dos Serviços de TI — Desenvolvimento de programas... [REPETIDO IDENTICO]
CNAE 6204000: Atividades dos Serviços de TI — Desenvolvimento de programas... [REPETIDO IDENTICO]
```

`buildExpandedProfile` (`company-profiler.ts` L37–47) faz lookup por `cnae.substring(0, 2)` (divisão), então TODOS os CNAEs da mesma divisão geram a MESMA descrição literal. Empresa de TI com 3 CNAEs `62XX` produz 3 blocos idênticos de ~600 chars cada. Embedding fica diluído em redundância. Soma com `Termos relacionados:` (até 50 keywords da divisão) infla mais.

**Tender** tem só `objeto` (`buildTenderText`, L88–104). `resumo`, `requisitos` quase sempre vazios na prática (medido). Edital nunca é puxado. Lado tender é informacionalmente raso.

## 3. Hipótese principal: prefixo

**REJEITADA.** Voyage não é família e5; usa `input_type` em vez de `query:`/`passage:`. Teste sandbox real (mesmo company+tender textos):

| configuração | cosine |
|---|---|
| both `input_type=document` (**produção atual**) | **0.6333** |
| both `input_type=query` | 0.5411 |
| company=query, tender=document | 0.4595 |

Conclusão MEDIDA: `both=document` é o ÓTIMO para Voyage em matching simétrico empresa↔licitação. Mexer em `input_type` PIORA. (Voyage docs confirmam: `document` para corpus indexado, `query` só pra busca curta one-shot — empresa+tender são ambos "documentos" do ponto de vista do modelo.)

## 4. Hipóteses secundárias (ranqueadas por evidência)

1. **🔴 Texto da empresa redundante e desbalanceado** (CAUSA #1, evidência forte).
   - Repetição literal de descrições por divisão CNAE.
   - Lista de até 50 keywords de divisão → ruído.
   - Profile 30–60× maior que objeto do tender → embedding da empresa fica num "hub" semântico amplo, baixando cosine com qualquer tender específico.

2. **🔴 Tender com texto curto e sem enriquecimento** (CAUSA #2, evidência forte).
   - `objeto` ~150 chars, `resumo` vazio, `requisitos` vazio.
   - Sem o edital baixado/parsed, o tender carrega ~10–30 tokens úteis. Cosine de doc curto vs doc longo é estruturalmente baixo.

3. **🟡 Modelo `voyage-3` (não `voyage-3-large` nem `voyage-law-2`)**: voyage-3 é o tier free. voyage-3-large performaria melhor em PT-BR técnico, mas é pago. Inferência, sem medição.

4. **🟢 Normalização**: OK (norm=1.0).

5. **🟢 Dimensão**: OK (1024 consistente entre código, migrations e respostas).

6. **🟡 HNSW recall**: índice usa default `ef_search=40` — pode estar perdendo vizinhos genuínos. Com 200 candidatos pedidos e threshold 0.45, é pouco provável ser o gargalo principal, mas vale subir `ef_search` para 100 e remedir.

## 5. Medidas reproduzidas

- **Top-20 similaridades reais SPACEAPPS** (TI consulting) × tenders com `match_tenders_by_embedding`: faixa **0.4272–0.4834**. Todos os top-20 são tenders genuinamente de TI (licenciamento de software, consultoria, sistemas, hospedagem). Recall qualitativo está OK; o que está errado é o **valor absoluto** da similaridade — deveria estar em 0.65–0.80 para esses casos óbvios.
- **Sandbox** com texto sintético limpo (4 linhas, sem repetição) deu cosine **0.633** entre empresa-TI e tender-TI no mesmo modelo (Voyage `document/document`). Isso é o teto realista do modelo neste domínio.
- **Score gravado em `matches.score_semantic`**: NULL universalmente — coluna definida pelo schema novo nunca é populada pelo worker. `breakdown` JSONB também muitas vezes vazio (`[]`). Não há como auditar a similaridade per-match no DB hoje. Bug latente no `semantic-matcher.ts`.

## 6. Recomendação

**Não aplicar fix de prefixo.** Em vez disso, atacar as duas causas reais:

### Fix A — limpar `buildExpandedProfile` (alto impacto, low risk)

`packages/workers/src/processors/company-profiler.ts` linhas 30–80:

- **Deduplicar descrições de divisão CNAE**: agrupar CNAEs por divisão e emitir UMA única linha com a descrição da divisão + lista dos códigos.
- **Cortar `Termos relacionados:`** ou reduzir de 50 → 10 keywords mais distintas.
- **Limitar profile a ~1500 chars** (alvo: 3–10× maior que tender objeto, não 30–60×).

Impacto esperado: cosine sobe de ~0.45 para ~0.55–0.65 nos top matches genuínos. **Reembedding de TODAS empresas necessário** (`embedding_text_hash` muda).

### Fix B — enriquecer texto do tender (alto impacto, médio esforço)

`buildTenderText` em `company-profiler.ts` L88–104:

- Já considera `resumo` e `requisitos` mas eles vêm vazios da pipeline. Verificar `extraction.processor.ts` — provavelmente o LLM extractor não está populando esses campos, ou só popula uma fração.
- Curto prazo: incluir `orgao_nome + uf + modalidade_nome + cnae_classificados` (descrições) no texto embedded.
- Médio prazo: backfill do `resumo` com 2-3 frases de LLM cheap (Gemini flash) a partir do edital quando disponível.

Impacto: cosine sobe ~0.05–0.10 adicional, e melhora discriminação entre tenders TI específicos.

### Fix C (opcional) — popular `score_semantic` no `semantic-matcher.ts`

Hoje a coluna existe mas nunca é gravada — perde-se observabilidade. Adicionar `score_semantic: result.similarity` ao upsert/update (L426 e L443).

### Não fazer agora

- Não trocar Voyage por outro provider antes de A+B. Modelo não é o gargalo.
- Não aplicar prefixos `query:`/`passage:` — ESSES SÃO PARA E5/BGE, NÃO para Voyage; mexer no `input_type` da Voyage piorou nos testes.
- Atualizar/remover comentário enganoso em `20260421000000_pgvector_matching_engine.sql` linha 59 ("TEI multilingual-e5-large").
