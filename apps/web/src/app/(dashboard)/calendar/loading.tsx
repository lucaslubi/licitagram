export default function CalendarLoading() {
  return (
    <div>
      <div className="h-8 w-32 bg-[#2d2f33] rounded animate-pulse mb-6" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-16 bg-[#1a1c1f] border border-[#2d2f33] rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  )
}
