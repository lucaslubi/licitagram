# ADR-0005: Modelos Claude — Opus 4.7 para raciocínio, Haiku 4.5 para throughput

- **Status**: Aceito
- **Data**: 2026-04-18
- **Referências**: D-5 do master plan

## Contexto

O LicitaGram Gov tem tarefas de IA heterogêneas:

- **Criativas/analíticas**: gerar ETP (13 incisos jurídicos), Mapa/Matriz de Riscos, consolidar PCA com deduplicação semântica, Parecer Jurídico Referencial.
- **Classificação/extração**: normalizar descrição → CATMAT, classificar tipo (material/serviço/obra), extrair entidades de documentos PDF.

Custo de Opus é aproximadamente 5x Haiku. Usar Opus em tudo queima orçamento; usar Haiku em tudo entrega outputs fracos em raciocínio jurídico.

## Decisão

- **`claude-opus-4-7`** (Opus 4.7): ETP, Matriz de Riscos, Parecer Referencial, consolidação de PCA, Edital, Technical Specialist Agent (30% técnico do TR).
- **`claude-haiku-4-5-20251001`** (Haiku 4.5): normalização CATMAT, classificação de processo, sugestão de itens por histórico, extração básica, DFD estrutural.

IDs hardcoded em `packages/gov-core/src/ai/claude.ts` via constante `CLAUDE_MODELS` — nunca hardcodar em callsites.

Todas as chamadas visíveis ao usuário devem ser **streaming** (RI-11). Usar `streamMessage()` wrapper.

## Consequências

**Positivas**:
- Economia projetada ~80% vs. usar Opus em tudo.
- Quality-of-output mantida nos artefatos críticos (jurídicos e regulatórios).

**Negativas**:
- Um desenvolvedor pode escolher errado o modelo — código review precisa olhar.
- Quando um novo modelo sair (Claude 4.8, etc.), vamos precisar atualizar a constante em um único lugar + rodar avaliação de qualidade antes de trocar.

## Observabilidade

Salvar em `licitagov.artefatos.modelo_usado` + `tokens_input/tokens_output/tempo_geracao_ms` para auditoria e análise de custo por artefato.
