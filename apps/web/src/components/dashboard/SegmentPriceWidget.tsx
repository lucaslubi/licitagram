'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface SegmentSummary {
  median: number
  count: number
  variation_percent: number | undefined
  direction: 'subindo' | 'estavel' | 'descendo'
  keyword: string
}

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export function SegmentPriceWidget() {
  const [data, setData] = useState<SegmentSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/price-history/segment-summary')
      .then((res) => {
        if (!res.ok) throw new Error('Not available')
        return res.json()
      })
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Card className="bg-[#1a1c1f] border-[#2d2f33] rounded-2xl animate-pulse">
        <CardContent className="pt-5 pb-4 px-5 h-[120px]" />
      </Card>
    )
  }

  if (!data) return null

  const dirConfig = {
    subindo: { color: 'text-red-400', icon: '\u25B2', label: 'Em alta' },
    estavel: { color: 'text-gray-400', icon: '\u2192', label: 'Estavel' },
    descendo: { color: 'text-emerald-400', icon: '\u25BC', label: 'Em queda' },
  }
  const dir = dirConfig[data.direction]

  return (
    <Link href={`/price-history?q=${encodeURIComponent(data.keyword)}`}>
      <Card className="bg-[#1a1c1f] border-[#2d2f33] rounded-2xl hover:border-[#F43E01]/20 transition-all duration-200 cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-400 font-medium">Preco do Meu Segmento</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-4 px-5">
          <p className="text-2xl font-bold text-white">{formatBRL(data.median)}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-xs font-medium ${dir.color}`}>
              {dir.icon} {dir.label}
              {data.variation_percent != null && ` ${data.variation_percent > 0 ? '+' : ''}${data.variation_percent.toFixed(1)}%`}
            </span>
            <span className="text-xs text-gray-500">|</span>
            <span className="text-xs text-gray-400">{data.count} registros</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1.5 truncate" title={data.keyword}>
            Busca: &quot;{data.keyword}&quot;
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
