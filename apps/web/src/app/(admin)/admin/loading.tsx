export default function Loading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1,2,3].map(i => (
          <div key={i} className="h-24 bg-gray-200 dark:bg-gray-800 rounded-lg" />
        ))}
      </div>
      <div className="h-96 bg-gray-200 dark:bg-gray-800 rounded-lg" />
    </div>
  )
}
