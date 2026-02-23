'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Activity, StickyNote, Mail, Phone, ArrowRightLeft, Mic, Loader2, PhoneOff, PhoneIncoming } from 'lucide-react'
import { api } from '@/lib/api/client'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
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
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({})

  const fetchActivity = async () => {
    const result = await api.getActivityTimeline(propertyId)
    if (result.data) {
      setItems(result.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchActivity()
  }, [propertyId])

  const handleTranscribe = async (callId: string) => {
    setTranscribing(prev => ({ ...prev, [callId]: true }))
    toast.info('Starting transcription...')
    try {
      const result = await api.transcribeCall(callId)
      if (result.error) {
        toast.error('Transcription failed: ' + result.error)
      } else {
        toast.success('Transcription complete!')
        // Refresh activity to show transcript
        fetchActivity()
      }
    } catch {
      toast.error('Transcription failed')
    }
    setTranscribing(prev => ({ ...prev, [callId]: false }))
  }

  const isAnsweredCall = (item: ActivityItem) => {
    return item.type === 'call' && item.status !== 'no-answer' && (item.duration ?? 0) > 0
  }

  const isUnansweredCall = (item: ActivityItem) => {
    return item.type === 'call' && (item.status === 'no-answer' || (item.duration ?? 0) === 0)
  }

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
              const isAnswered = isAnsweredCall(item)
              const isUnanswered = isUnansweredCall(item)

              // Use different icons for call outcomes
              let config = typeIcons[item.type] || typeIcons.note
              if (isUnanswered) {
                config = { icon: PhoneOff, color: 'text-red-500 bg-red-50 dark:bg-red-900/30' }
              } else if (isAnswered) {
                config = { icon: PhoneIncoming, color: 'text-green-500 bg-green-50 dark:bg-green-900/30' }
              }
              const Icon = config.icon

              return (
                <div key={item.id} className="relative flex gap-3 py-2.5">
                  <div className={`relative z-10 h-[30px] w-[30px] rounded-full flex items-center justify-center flex-shrink-0 ${config.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm truncate flex-1">{item.content}</p>
                      {/* Call outcome badge */}
                      {isAnswered && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 shrink-0">
                          Answered
                        </Badge>
                      )}
                      {isUnanswered && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 shrink-0">
                          No Answer
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground">
                        {item.user || 'System'} &middot;{' '}
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </p>
                      {/* Transcribe button — only for answered calls with recordings */}
                      {isAnswered && item.callId && item.recording_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-[10px] gap-1 text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-950/30"
                          onClick={() => handleTranscribe(item.callId!)}
                          disabled={transcribing[item.callId]}
                        >
                          {transcribing[item.callId] ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Mic className="h-3 w-3" />
                          )}
                          Transcribe
                        </Button>
                      )}
                    </div>
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
