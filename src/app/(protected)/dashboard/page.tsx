'use client'

import { useAuth } from '@/providers/auth-provider'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { RecentLeads } from '@/components/dashboard/recent-leads'
import { RecentCalls } from '@/components/dashboard/recent-calls'

export default function DashboardPage() {
  const { profile } = useAuth()

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}, {profile?.full_name?.split(' ')[0] || 'there'}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s what&apos;s happening with your leads today.
        </p>
      </div>

      <StatsCards />

      <div className="grid md:grid-cols-2 gap-6">
        <RecentLeads />
        <RecentCalls />
      </div>
    </div>
  )
}
