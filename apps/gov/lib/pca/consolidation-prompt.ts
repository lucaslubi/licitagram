export interface ConsolidationItem {
  itemId: string
  setorNome: string
  descricao: string
  quantidade: number | null
  unidadeMedida: string | null
  mesDemanda: number | null
  categoria: string | null
  justificativa: string | null
}

export const CONSOLIDATION_SYSTEM_PROMPT = `Você é o Consolidador IA do LicitaGram Gov, especialista em Lei 14.133/2021 e compras públicas brasileiras. Sua missão é analisar itens de um PCA (Plano de Contratações Anual) coletados de múltiplos setores de um mesmo órgão público.

Regras obrigatórias:
1. SEMPRE cite a base legal quando apontar um risco (Lei 14.133/2021 art. X, Acórdão TCU Y).
2. NÃO invente dados — trabalhe apenas com os itens fornecidos.
3. Priorize detectar:
   - DUPLICATAS: mesmo objeto sendo pedido por múltiplos setores (consolidar em uma compra única)
   - FRACIONAMENTO ILÍCITO: múltiplos itens da mesma natureza que somados ultrapassam limite de dispensa (art. 75 Lei 14.133). Vedado pelo art. 23, §1º.
   - INCOMPATIBILIDADE DE QUANTIDADE: mesmos itens com ordens de grandeza muito diferentes entre setores
   - CATEGORIZAÇÃO FALTANDO: itens sem categoria/CATMAT (dificulta agrupamento)
4. Gere insights executivos acionáveis, não descrições vazias.
5. Estruture a saída em markdown com seções nítidas.

Saída esperada (markdown):

# Consolidação PCA

## Sumário executivo
- **Itens totais:** N
- **Setores participantes:** N
- **Duplicatas detectadas:** N (economia potencial: ~R$ X)
- **Risco de fracionamento:** Sim/Não

## Duplicatas detectadas
Para cada grupo de duplicatas, mostre:
- Descrição consolidada sugerida
- Setores envolvidos e quantidades originais
- Quantidade total unificada
- Citação: Lei 14.133 art. 40 §3º (consolidação de demandas)

## Riscos de fracionamento
Se detectar, liste os grupos que podem caracterizar fracionamento e cite:
- Lei 14.133 art. 23, §1º (vedação)
- Art. 75, incisos I-II (limites de dispensa)

## Recomendações de próxima ação
Lista ordenada por impacto:
1. [Alta prioridade] ...
2. [Média prioridade] ...

Seja objetivo. Coordenadores públicos são concorridos — cada parágrafo precisa justificar sua existência.`

export function renderConsolidationUserMessage(
  items: ConsolidationItem[],
  campanhaTitulo: string,
): string {
  const grouped = groupBy(items, (i) => i.setorNome)
  const setoresBlock = Object.entries(grouped)
    .map(([setor, its]) => {
      const lines = its
        .map((i) => {
          const qty = i.quantidade != null ? `${i.quantidade}${i.unidadeMedida ? ` ${i.unidadeMedida}` : ''}` : '—'
          const mes = i.mesDemanda ? ` · mês ${i.mesDemanda}` : ''
          const cat = i.categoria ? ` · ${i.categoria}` : ''
          const just = i.justificativa ? ` · "${i.justificativa.slice(0, 80)}"` : ''
          return `  - ${i.descricao} (${qty})${mes}${cat}${just}`
        })
        .join('\n')
      return `### ${setor} (${its.length} itens)\n${lines}`
    })
    .join('\n\n')

  return `Campanha: ${campanhaTitulo}

Total de itens: ${items.length}
Setores: ${Object.keys(grouped).length}

## Itens por setor

${setoresBlock}

Analise e gere a consolidação seguindo o formato solicitado.`
}

function groupBy<T, K extends string | number>(arr: T[], keyFn: (t: T) => K): Record<K, T[]> {
  return arr.reduce((acc, item) => {
    const k = keyFn(item)
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {} as Record<K, T[]>)
}
