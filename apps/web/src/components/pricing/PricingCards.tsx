'use client'

import { useState } from 'react'
import Link from 'next/link'

const PLANS = [
  {
    name: 'Essencial',
    monthlyPrice: 297,
    annualPrice: 237,
    badge: null,
    features: [
      'Telegram SmartAlerts (Notificações em tempo real)',
      '+200.000 licitações monitoradas/mês',
      'AI Matching com score 0-100 (50 matches no trial)',
      'Pipeline Kanban e Dashboards',
      'Gestão de Certidões (13 tipos)',
      'Filtros avançados e Busca full-text',
      '1 usuário',
      'Suporte por email',
    ],
    cta: 'Teste 7 dias grátis',
    highlighted: false,
    slug: 'starter',
  },
  {
    name: 'Profissional',
    monthlyPrice: 697,
    annualPrice: 557,
    badge: 'Mais popular',
    features: [
      'Tudo do Essencial +',
      'WhatsApp FastMatch (Alertas instantâneos)',
      'Licitagram GeoRadar (Visão estratégica regional)',
      'AI Matching Ilimitado',
      '"Pergunte ao Edital" (Chat IA com PDF)',
      'Compliance Checker e Análise de Risco',
      'Pesquisa de Preços IN 65/2021',
      'Inteligência Competitiva (5 módulos)',
      'Até 5 usuários',
      'Suporte prioritário',
    ],
    cta: 'Teste 7 dias grátis',
    highlighted: true,
    slug: 'professional',
  },
  {
    name: 'Enterprise',
    monthlyPrice: 1497,
    annualPrice: 1197,
    badge: 'Completo',
    features: [
      'Tudo do Profissional +',
      'Licitagram Prospector (Outbound B2B)',
      'Guardian Compliance (Certidões automáticas)',
      'Robô de Lances com IA estratégica',
      'Sugestão de lance e Detecção de Anomalias',
      'Multi-CNPJ e API de integração',
      'Usuários ilimitados',
      'Onboarding Premium e Suporte dedicado',
    ],
    cta: 'Assinar Agora',
    highlighted: false,
    slug: 'enterprise',
  },
]

function formatPrice(value: number): string {
  return value.toLocaleString('pt-BR')
}

export function PricingCards() {
  const [isAnnual, setIsAnnual] = useState(false)

  return (
    <>
      {/* Billing Toggle */}
      <div className="flex items-center justify-center gap-4 mb-12">
        <span className={`text-sm font-medium transition-colors ${!isAnnual ? 'text-[#1A1C1F]' : 'text-[#8B8B8B]'}`}>
          Mensal
        </span>
        <button
          onClick={() => setIsAnnual(!isAnnual)}
          className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
            isAnnual ? 'bg-[#F43E01]' : 'bg-[#D4D4D0]'
          }`}
          aria-label="Alternar entre mensal e anual"
        >
          <span
            className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300 ${
              isAnnual ? 'translate-x-7' : 'translate-x-0'
            }`}
          />
        </button>
        <span className={`text-sm font-medium transition-colors ${isAnnual ? 'text-[#1A1C1F]' : 'text-[#8B8B8B]'}`}>
          Anual
        </span>
        {isAnnual && (
          <span className="text-xs font-semibold text-[#F43E01] bg-[#F43E01]/10 px-3 py-1 rounded-full">
            Economize 20%
          </span>
        )}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const price = isAnnual ? plan.annualPrice : plan.monthlyPrice
          return (
            <div
              key={plan.name}
              className={`relative p-8 rounded-2xl border-2 bg-white transition-all duration-300 hover:-translate-y-1 h-full ${
                plan.highlighted
                  ? 'border-[#F43E01] shadow-[0_0_40px_-8px_rgba(244,62,1,0.2)] md:scale-[1.02]'
                  : 'border-[#E5E5E0]/50 shadow-sm hover:shadow-md hover:border-[#F43E01]/20'
              }`}
            >
              {plan.badge && (
                <span className={`absolute -top-3.5 left-1/2 -translate-x-1/2 font-mono text-[10px] font-semibold px-4 py-1 rounded-full uppercase tracking-wider whitespace-nowrap ${
                  plan.highlighted
                    ? 'bg-[#F43E01] text-white'
                    : 'bg-[#1A1C1F] text-white border border-white/10'
                }`}>
                  {plan.badge}
                </span>
              )}
              <h3 className="text-lg font-bold text-[#1A1C1F]">{plan.name}</h3>
              <div className="mt-4 mb-1">
                <span className="font-mono text-4xl font-bold text-[#1A1C1F] tracking-tight">
                  R$ {formatPrice(price)}
                </span>
                <span className="text-[#69695D] ml-1">/mês</span>
              </div>
              {isAnnual && (
                <div className="mb-4">
                  <span className="text-xs text-[#8B8B8B] line-through mr-2">R$ {formatPrice(plan.monthlyPrice)}/mês</span>
                  <span className="text-xs text-[#F43E01] font-semibold">
                    Cobrado R$ {formatPrice(price * 12)}/ano
                  </span>
                </div>
              )}
              {!isAnnual && <div className="mb-4" />}
              <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <svg className="w-5 h-5 text-[#F43E01] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-[#4A4A45]">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/billing?plan=${plan.slug}${isAnnual ? '&billing=annual' : ''}`}
                className={`block text-center py-3.5 rounded-full font-medium text-sm transition-all duration-200 ${
                  plan.highlighted
                    ? 'bg-[#F43E01] text-white hover:bg-[#D63500] shadow-md shadow-[#F43E01]/20'
                    : 'bg-[#1A1C1F]/5 text-[#1A1C1F] border border-[#1A1C1F]/10 hover:bg-[#1A1C1F]/10'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          )
        })}
      </div>
    </>
  )
}
