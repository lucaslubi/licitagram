export default function Loading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-[#2d2f33] rounded" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1,2,3].map(i => (
          <div key={i} className="h-24 bg-[#2d2f33] rounded-lg" />
        ))}
      </div>
      <div className="h-96 bg-[#2d2f33] rounded-lg" />
    </div>
  )
}
