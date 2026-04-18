# ADR-0005: IA provider — Gemini 2.5 como padrão, Claude como alternativa

- **Status**: Aceito (revisado 2026-04-18 — originalmente Claude Opus + Haiku)
- **Data**: 2026-04-18
- **Referências**: D-5 do master plan

## Contexto

O LicitaGram Gov tem tarefas de IA heterogêneas:

- **Criativas/analíticas**: gerar ETP (13 incisos jurídicos), Mapa/Matriz de Riscos, consolidar PCA com deduplicação semântica, Parecer Jurídico Referencial.
- **Classificação/extração**: normalizar descrição → CATMAT, classificar tipo (material/serviço/obra), extrair entidades de documentos PDF.

A escolha inicial foi Claude Opus 4.7 + Haiku 4.5 por qualidade em raciocínio jurídico. Na prática, o usuário paga Gemini (Google AI Studio) e quer concentrar custo num provider.

## Decisão

**Gemini 2.5 Pro** substitui Opus para raciocínio profundo.
**Gemini 2.5 Flash** substitui Haiku para normalização/classificação.

A camada de abstração em [`packages/gov-core/src/ai/index.ts`](../../../packages/gov-core/src/ai/index.ts) expõe:

```ts
export const AI_MODELS = {
  reasoning: 'gemini-2.5-pro',
  fast: 'gemini-2.5-flash',
}

export async function* streamText(opts): AsyncGenerator<string>
```

`streamText` roteia por prefixo do model ID:
- `gemini-*` → `@google/generative-ai` SDK
- `claude-*` → `@anthropic-ai/sdk`

Consumidores (rotas `/api/ai/*`) chamam `streamText({ model: AI_MODELS.reasoning, ... })` — a troca de provider é uma única mudança de string aqui.

### Quando usar cada modelo

| Tarefa | Modelo | Motivo |
|---|---|---|
| Consolidação PCA | `AI_MODELS.reasoning` (Gemini 2.5 Pro) | Detectar duplicatas + fracionamento exige análise holística |
| ETP (13 incisos) — Fase 4 | `AI_MODELS.reasoning` | Raciocínio jurídico sofisticado |
| Parecer Referencial — Fase 8 | `AI_MODELS.reasoning` | Citações e pressupostos de fato/direito |
| Normalização CATMAT | `AI_MODELS.fast` (Gemini 2.5 Flash) | Extração simples, muitos requests |
| Sugestão de itens por histórico | `AI_MODELS.fast` | Classificação + agrupamento rápido |
| DFD estrutural — Fase 4 | `AI_MODELS.fast` | Template preenchido com contexto |

## Consequências

**Positivas**:
- Custo unificado em uma conta Google AI.
- Gemini 2.5 Pro tem contexto gigante (1M tokens), útil para consolidações grandes.
- SDK oficial Google é estável e bem documentado.
- Abstração `streamText` permite trocar provider por rota sem mexer em consumers.

**Negativas**:
- Diferenças sutis de output entre Gemini e Claude em tarefas jurídicas — necessário validar cada prompt após a troca (Fases 4+ começam já em Gemini).
- Dependência de provider único (Google). Mitigação: Claude fica disponível via `AI_MODELS.reasoning = 'claude-opus-4-7'` bastando trocar a string.
- Modelos Gemini mudam de ID sem aviso (ex: `gemini-2.5-pro` vira `gemini-3.0-pro`). Centralizar IDs em `AI_MODELS` facilita manutenção.

## Observabilidade

- Salvar em `licitagov.artefatos.modelo_usado` + `tokens_input/tokens_output/tempo_geracao_ms` para auditoria e análise de custo por artefato (independe de provider).
- Claude wrapper fica em `packages/gov-core/src/ai/claude.ts` — pode ser usado ponto-a-ponto pra comparação A/B quando a qualidade Gemini não convencer.

## Config

Env vars (apps/gov):

```
GEMINI_API_KEY=...          # obrigatória (ou GOOGLE_AI_API_KEY como alias)
ANTHROPIC_API_KEY=...       # opcional — só se usar um modelo claude-* em algum lugar
```

A ausência de `GEMINI_API_KEY` faz os endpoints `/api/ai/*` retornarem 500 com mensagem clara, sem crashar o app.
