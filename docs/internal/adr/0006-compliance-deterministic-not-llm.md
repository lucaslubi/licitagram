# ADR-0006: Compliance Engine determinístico — regras em código, não LLM

- **Status**: Aceito
- **Data**: 2026-04-18
- **Referências**: RI-12 do master plan

## Contexto

A fase interna das licitações sob Lei 14.133/2021 tem regras que devem bloquear publicação: prazos mínimos por modalidade (art. 55), limites de dispensa (art. 75), segregação de funções (art. 7º), matriz de riscos obrigatória (art. 22), 5 incisos obrigatórios do ETP (art. 18 §1º, I/IV/VI/VIII/XIII), cesta de preços (Acórdão 1.875/2021-TCU), vedação a fracionamento (art. 23).

Essas regras são **conhecidas, numéricas, verificáveis**. Deixar para um LLM avaliar é convite a hallucination, falta de rastreabilidade, e inconsistência entre execuções.

## Decisão

O Compliance Engine (`packages/gov-core/src/compliance/engine.ts`, Fase 8) é código Python/TypeScript puro. Cada regra é um arquivo em `compliance/rules/` que retorna:

```ts
interface ComplianceResult {
  conforme: boolean
  detalhe: string
  citacao: { lei: string; artigo: string; paragrafo?: string; inciso?: string; acordao?: string }
  severidade: 'critica' | 'alta' | 'media' | 'baixa'
}
```

LLMs (Opus 4.7) **sugerem texto** (ETP, parecer, risco) — mas nunca decidem se algo é compliant. Validator puro é quem bloqueia o botão "Publicar".

## Consequências

**Positivas**:
- Auditoria do TCU pode inspecionar cada regra — código é público, versionado, testável.
- Zero variância entre execuções para o mesmo input.
- Testes unitários com fixtures reais garantem que mudanças de lei exigem patch explícito.
- Citações jurídicas embutidas na resposta (RI-13).

**Negativas**:
- Regras precisam ser mantidas manualmente quando a lei muda (decretos, acórdãos novos). Mitigação: tabela `licitagov.perfis_regulatorios` com regras em JSONB permite override por esfera/UF sem redeploy.
- Casos cinza (ex. "objeto único pode fracionar?") ainda precisam de julgamento humano — LLM sugere, jurídico decide, engine valida o resultado.
