'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { AddPropertyModal } from '@/components/leads/add-property-modal'
import { CsvUploadModal } from '@/components/leads/csv-upload-modal'
import { KanbanBoard } from '@/components/leads/kanban-board'
import { LeadsFilterPanel, type LeadsFilters } from '@/components/leads/leads-filter-panel'
import { BulkActionsBar } from '@/components/leads/bulk-actions-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/providers/auth-provider'
import type { Property } from '@/types/schema'

export default function LeadsPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const saved = sessionStorage.getItem('leads-selected-ids')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })
  const [filters, setFilters] = useState<LeadsFilters>({
    search: '',
    priority: 'all',
    listId: 'all',
    followUpFrom: undefined,
    followUpTo: undefined,
  })
  const { user } = useAuth()

  const fetchProperties = useCallback(async () => {
    if (!user) return

    setLoading(true)
    const supabase = createClient()

    // Supabase caps queries at 1,000 rows by default.
    // Paginate through all leads so accounts with >1,000 leads see everything.
    const PAGE_SIZE = 1000
    let allData: Property[] = []
    let from = 0
    let hasMore = true

    while (hasMore) {
      const { data, error } = await supabase
        .from('properties')
        .select(`
          *,
          list:lead_lists(id, name)
        `)
        .eq('created_by', user.id)
        .order('follow_up_date', { ascending: true, nullsFirst: false })
        .range(from, from + PAGE_SIZE - 1)

      if (error || !data) {
        hasMore = false
      } else {
        allData = allData.concat(data as Property[])
        hasMore = data.length === PAGE_SIZE
        from += PAGE_SIZE
      }
    }

    setProperties(allData)
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchProperties()
  }, [fetchProperties])

  useEffect(() => {
    try {
      sessionStorage.setItem('leads-selected-ids', JSON.stringify(Array.from(selectedIds)))
    } catch {}
  }, [selectedIds])

  // Filter properties locally
  const filteredProperties = useMemo(() => {
    return properties.filter((p) => {
      // Search filter (address, city, owner, list name)
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        const matchesSearch =
          p.address?.toLowerCase().includes(searchLower) ||
          p.city?.toLowerCase().includes(searchLower) ||
          p.state?.toLowerCase().includes(searchLower) ||
          p.owner_name?.toLowerCase().includes(searchLower) ||
          p.list?.name?.toLowerCase().includes(searchLower)
        if (!matchesSearch) return false
      }

      // Priority filter
      if (filters.priority !== 'all' && p.priority !== filters.priority) {
        return false
      }

      // List filter
      if (filters.listId !== 'all' && p.list_id !== filters.listId) {
        return false
      }

      // Follow-up date range
      if (filters.followUpFrom && p.follow_up_date) {
        const followUp = new Date(p.follow_up_date)
        if (followUp < filters.followUpFrom) return false
      }
      if (filters.followUpTo && p.follow_up_date) {
        const followUp = new Date(p.follow_up_date)
        if (followUp > filters.followUpTo) return false
      }

      return true
    })
  }, [properties, filters])

  const handleSelect = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (selected) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const handleClearSelection = () => {
    setSelectedIds(new Set())
  }

  const totalByStatus = useMemo(() => {
    return {
      new: filteredProperties.filter((p) => p.status === 'new').length,
      contacted: filteredProperties.filter((p) => p.status === 'contacted').length,
      warm: filteredProperties.filter((p) => p.status === 'warm').length,
      follow_up: filteredProperties.filter((p) => p.status === 'follow_up').length,
      closed: filteredProperties.filter((p) => p.status === 'closed').length,
    }
  }, [filteredProperties])

  const totalCount = filteredProperties.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {totalCount} {totalCount === 1 ? 'lead' : 'leads'}
            {filters.search || filters.priority !== 'all' || filters.listId !== 'all'
              ? ' (filtered)'
              : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <AddPropertyModal onPropertyAdded={fetchProperties} />
          <CsvUploadModal onImportComplete={fetchProperties} />
        </div>
      </div>

      {/* Filters */}
      <LeadsFilterPanel filters={filters} onFiltersChange={setFilters} />

      {/* Kanban Board */}
      {loading ? (
        <div className="flex gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-80 flex-shrink-0">
              <Skeleton className="h-8 w-24 mb-3" />
              <Skeleton className="h-[500px] rounded-lg" />
            </div>
          ))}
        </div>
      ) : filteredProperties.length === 0 && !filters.search && filters.priority === 'all' && filters.listId === 'all' ? (
        <div className="text-center py-16">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium">No leads yet</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Import a CSV or add a property manually to get started.
          </p>
        </div>
      ) : (
        <KanbanBoard
          leads={filteredProperties}
          selectedIds={selectedIds}
          isSelectionMode={selectedIds.size > 0}
          onSelect={handleSelect}
          onUpdate={fetchProperties}
        />
      )}

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        selectedIds={selectedIds}
        onClear={handleClearSelection}
        onUpdate={fetchProperties}
      />
    </div>
  )
}
