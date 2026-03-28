import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRedisClient } from '@/lib/redis-client'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const redis = getRedisClient()
    if (!redis) {
      return NextResponse.json({ trending: [] })
    }

    // Get top 10 from ZSET (descending score)
    const results = await redis.zrevrange('ph:trending', 0, 9, 'WITHSCORES')

    // Results come as [member, score, member, score, ...]
    const trending: { query: string; count: number }[] = []
    for (let i = 0; i < results.length; i += 2) {
      trending.push({
        query: results[i],
        count: parseInt(results[i + 1], 10),
      })
    }

    return NextResponse.json({ trending })
  } catch (e: unknown) {
    console.error('Trending error:', e)
    return NextResponse.json({ trending: [] })
  }
}
