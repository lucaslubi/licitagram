export default function PricingCalculatorLoading() {
  return (
    <div>
      <div className="h-8 w-64 bg-[#2d2f33] rounded animate-pulse mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 bg-[#1a1c1f] border border-[#2d2f33] rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-[#1a1c1f] border border-[#2d2f33] rounded-xl animate-pulse" />
      </div>
    </div>
  )
}
