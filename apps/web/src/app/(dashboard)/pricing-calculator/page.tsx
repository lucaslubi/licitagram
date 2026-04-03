import { redirect } from 'next/navigation'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { BDICalculator } from './bdi-calculator'

export default async function PricingCalculatorPage() {
  const user = await getUserWithPlan()
  if (!user) redirect('/login')
  if (!hasFeature(user, 'proposal_generator') && !user.isPlatformAdmin) {
    redirect('/billing?upgrade=true')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Calculadora BDI / Formação de Preços</h1>
      <p className="text-gray-400 text-sm mb-6">Monte sua composição de custos e calcule o BDI para licitações</p>
      <BDICalculator />
    </div>
  )
}
