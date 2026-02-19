'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Activity, StickyNote, Mail, Phone, ArrowRightLeft } from 'lucide-react'
import { api } from '@/lib/api/client'
import { formatDistanceToNow } from 'date-fns'
import type { ActivityItem } from '@/types/schema'

const typeIcons: Record<string, { icon: typeof StickyNote; color: string }> = {
  note: { icon: StickyNote, color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/30' },
  email: { icon: Mail, color: 'text-green-500 bg-green-50 dark:bg-green-900/30' },
  call: { icon: Phone, color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/30' },
  sms: { icon: Mail, color: 'text-teal-500 bg-teal-50 dark:bg-teal-900/30' },
  status_change: { icon: ArrowRightLeft, color: 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800' },
}

export function ActivityTimeline({ propertyId }: { propertyId: string }) {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchActivity = async () => {
      const result = await api.getActivityTimeline(propertyId)
      if (result.data) {
        setItems(result.data)
      }
      setLoading(false)
    }
    fetchActivity()
  }, [propertyId])

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-zinc-500" />
          Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No activity yet.
          </p>
        ) : (
          <div className="relative space-y-0">
            {/* Vertical line */}
            <div className="absolute left-[15px] top-3 bottom-3 w-px bg-zinc-200 dark:bg-zinc-700" />

            {items.map((item) => {
              const config = typeIcons[item.type] || typeIcons.note
              const Icon = config.icon

              return (
                <div key={item.id} className="relative flex gap-3 py-2.5">
                  <div className={`relative z-10 h-[30px] w-[30px] rounded-full flex items-center justify-center flex-shrink-0 ${config.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 pt-1">
                    <p className="text-sm truncate">{item.content}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.user || 'System'} &middot;{' '}
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
