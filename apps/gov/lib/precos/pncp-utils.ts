import type { PrecoTrendPoint } from './pncp-engine'

/**
 * Preenche gaps na série mensal. Se a query retornou só 2 meses com
 * dados, o gráfico mostra só 2 pontos. Essa função insere pontos zero
 * nos meses faltantes e garante janela mínima de `minMonths`.
 *
 * Função pura síncrona — fora do arquivo 'use server' do engine.
 */
export function fillTrendGaps(points: PrecoTrendPoint[], minMonths = 6): PrecoTrendPoint[] {
  const now = new Date()
  const map = new Map(points.map((p) => [p.mes, p]))
  const start = points.length
    ? points[0]!.mes
    : `${now.getFullYear() - (minMonths >= 12 ? 1 : 0)}-${String(Math.max(1, now.getMonth() + 1 - minMonths + 1)).padStart(2, '0')}`
  const [sy, sm] = start.split('-').map(Number)
  const out: PrecoTrendPoint[] = []
  let cur = new Date(sy!, sm! - 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 1)
  while (cur <= end) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
    out.push(map.get(key) ?? { mes: key, n: 0, media: 0, mediana: 0, minimo: 0, maximo: 0 })
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }
  while (out.length < minMonths) {
    const first = out[0]!.mes
    const [fy, fm] = first.split('-').map(Number)
    const prev = new Date(fy!, fm! - 2, 1)
    out.unshift({
      mes: `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`,
      n: 0,
      media: 0,
      mediana: 0,
      minimo: 0,
      maximo: 0,
    })
  }
  return out
}
