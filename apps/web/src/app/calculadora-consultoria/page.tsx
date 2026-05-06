import type { Metadata } from 'next'
import { CalculadoraConsultoriaClient } from './calculadora-client'

export const metadata: Metadata = {
  title: 'Calculadora de Faturamento — Licitagram Partners',
  description:
    'Calcule quanto sua consultoria de licitação pode faturar a mais com o Licitagram. ROI, capacidade operacional e faturamento adicional em tempo real.',
  openGraph: {
    title: 'Calculadora de Faturamento — Licitagram Partners',
    description:
      'Quanto sua consultoria pode faturar a mais com o Licitagram? Calcule em 30 segundos.',
  },
}

export default function CalculadoraConsultoriaPage() {
  return <CalculadoraConsultoriaClient />
}
