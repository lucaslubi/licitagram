'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface FraudAlert {
  id: string
  alert_type: string
  severity: string
  cnpj_1: string | null
  cnpj_2: string | null
  empresa_1: string | null
  empresa_2: string | null
  detail: string
}

const ALERT_CONFIG: Record<string, { label: string; icon: string; colors: string }> = {
  EMPRESA_SANCIONADA: { label: 'Sancionada', icon: '🔴', colors: 'bg-red-500/20 text-red-400 border-red-500/30' },
  SOCIO_EM_COMUM: { label: 'Socio em comum', icon: '🟠', colors: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  ENDERECO_COMPARTILHADO: { label: 'Endereco compartilhado', icon: '🟠', colors: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  EMPRESA_RECENTE: { label: 'Empresa recente', icon: '🟡', colors: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  CAPITAL_INCOMPATIVEL: { label: 'Capital incompativel', icon: '🟡', colors: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
}

// Export a component that shows badges for a specific CNPJ within a tender
export function FraudAlertBadges({ tenderId, cnpj }: { tenderId: string; cnpj: string }) {
  const [alerts, setAlerts] = useState<FraudAlert[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('fraud_alerts')
      .select('*')
      .eq('tender_id', tenderId)
      .or(`cnpj_1.eq.${cnpj},cnpj_2.eq.${cnpj}`)
      .eq('resolved', false)
      .then(({ data }) => {
        if (data) setAlerts(data)
      })
  }, [tenderId, cnpj])

  if (alerts.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      {alerts.map((alert) => {
        const config = ALERT_CONFIG[alert.alert_type] || { label: alert.alert_type, icon: '⚠️', colors: 'bg-gray-500/20 text-gray-400 border-gray-500/30' }
        return (
          <span
            key={alert.id}
            className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${config.colors} cursor-help`}
            title={alert.detail}
          >
            {config.icon} {config.label}
          </span>
        )
      })}
    </div>
  )
}

// Export a hook that fetches ALL alerts for a tender + whether analysis was run
export function useFraudAlerts(tenderId: string) {
  const [alerts, setAlerts] = useState<FraudAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzed, setAnalyzed] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    // Fetch alerts and check if fraud analysis was run for this tender
    Promise.all([
      supabase
        .from('fraud_alerts')
        .select('*')
        .eq('tender_id', tenderId)
        .eq('resolved', false)
        .order('severity', { ascending: true }),
      supabase
        .from('tenders')
        .select('fraud_analyzed')
        .eq('id', tenderId)
        .single(),
    ]).then(([alertsRes, tenderRes]) => {
      if (alertsRes.data) setAlerts(alertsRes.data)
      setAnalyzed(tenderRes.data?.fraud_analyzed === true)
      setLoading(false)
    })
  }, [tenderId])

  return { alerts, loading, analyzed }
}
