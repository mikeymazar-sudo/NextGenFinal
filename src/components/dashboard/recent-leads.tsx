'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/providers/auth-provider'
import { formatDistanceToNow } from 'date-fns'
import type { Property } from '@/types/schema'

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  warm: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  reach_out: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  closed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
}

export function RecentLeads() {
  const [leads, setLeads] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return

    const fetchLeads = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('properties')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(5)

      setLeads((data as Property[]) || [])
      setLoading(false)
    }

    fetchLeads()
  }, [user])

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Recent Leads</CardTitle>
        <Link href="/leads" className="text-sm text-blue-600 hover:underline">
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
        ) : leads.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No leads yet. Search for a property to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {leads.map((lead) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{lead.address}</p>
                  <p className="text-xs text-muted-foreground">
                    {[lead.city, lead.state].filter(Boolean).join(', ')}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <Badge variant="secondary" className={statusColors[lead.status]}>
                    {lead.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
