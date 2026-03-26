import { Card, CardContent } from '@/components/ui/card'

interface StatsCardProps {
  title: string
  value: string | number
  description?: string
  trend?: { value: number; label: string }
}

export function StatsCard({ title, value, description, trend }: StatsCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm font-medium text-gray-400">{title}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {description && (
          <p className="text-xs text-gray-400 mt-1">{description}</p>
        )}
        {trend && (
          <p className={`text-xs mt-2 ${trend.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
