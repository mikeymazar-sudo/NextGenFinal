'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/providers/auth-provider'
import { formatDistanceToNow } from 'date-fns'
import { Phone } from 'lucide-react'
import type { Call } from '@/types/schema'

export function RecentCalls() {
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return

    const fetchCalls = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('calls')
        .select('*')
        .eq('caller_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5)

      setCalls((data as Call[]) || [])
      setLoading(false)
    }

    fetchCalls()
  }, [user])

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Recent Calls</CardTitle>
        <Link href="/dialer" className="text-sm text-blue-600 hover:underline">
          View All
        </Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-4">
            <Phone className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              No calls yet. Use the dialer to make your first call.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {calls.map((call) => (
              <div
                key={call.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium font-mono">{call.to_number || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDuration(call.duration)} &middot; {call.status || 'unknown'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <Badge variant="secondary" className="text-xs">
                    {call.status || 'unknown'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(call.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
