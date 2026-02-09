'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Building2, Flame, Phone, Brain } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/providers/auth-provider'

interface Stats {
  totalLeads: number
  hotLeads: number
  callsToday: number
  analysesRun: number
}

export function StatsCards() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return

    const fetchStats = async () => {
      const supabase = createClient()

      const [totalRes, hotRes, callsRes, analysesRes] = await Promise.all([
        supabase.from('properties').select('id', { count: 'exact', head: true }).eq('created_by', user.id),
        supabase.from('properties').select('id', { count: 'exact', head: true }).eq('created_by', user.id).eq('status', 'hot'),
        supabase.from('calls').select('id', { count: 'exact', head: true }).eq('caller_id', user.id).gte('created_at', new Date().toISOString().split('T')[0]),
        supabase.from('properties').select('id', { count: 'exact', head: true }).eq('created_by', user.id).not('ai_analysis', 'is', null),
      ])

      setStats({
        totalLeads: totalRes.count || 0,
        hotLeads: hotRes.count || 0,
        callsToday: callsRes.count || 0,
        analysesRun: analysesRes.count || 0,
      })
      setLoading(false)
    }

    fetchStats()
  }, [user])

  const cards = [
    { title: 'Total Leads', value: stats?.totalLeads, icon: Building2, color: 'text-blue-600' },
    { title: 'Hot Leads', value: stats?.hotLeads, icon: Flame, color: 'text-orange-500' },
    { title: 'Calls Today', value: stats?.callsToday, icon: Phone, color: 'text-green-600' },
    { title: 'Analyses Run', value: stats?.analysesRun, icon: Brain, color: 'text-purple-600' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.title} className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-bold">{card.value}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
