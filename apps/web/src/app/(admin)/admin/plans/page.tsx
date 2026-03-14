import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { getAllPlans } from '@/actions/admin/plans'
import { PlanEditCard } from '@/components/admin/plan-edit-card'

export default async function AdminPlansPage() {
  await requirePlatformAdmin()
  const { plans } = await getAllPlans()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Planos</h1>
        <p className="text-sm text-gray-500">{plans.length} plano(s)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan: any) => (
          <PlanEditCard key={plan.id} plan={plan} />
        ))}
      </div>
    </div>
  )
}
