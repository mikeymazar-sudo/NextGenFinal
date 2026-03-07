'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Badge } from '@/components/ui/badge'
import { LeadCard } from './lead-card'
import type { Property } from '@/types/schema'

interface KanbanColumnProps {
    id: string
    title: string
    color: string
    leads: Property[]
    selectedIds: Set<string>
    isSelectionMode: boolean
    onSelect: (id: string, selected: boolean) => void
    onUpdate: () => void
}

const columnColors: Record<string, string> = {
    new: 'bg-blue-500',
    warm: 'bg-orange-500',
    follow_up: 'bg-purple-500',
    closed: 'bg-green-500',
}

export function KanbanColumn({
    id,
    title,
    color,
    leads,
    selectedIds,
    isSelectionMode,
    onSelect,
    onUpdate,
}: KanbanColumnProps) {
    const { setNodeRef, isOver } = useDroppable({ id })

    // Sort by follow-up date (soonest first, nulls last)
    const sortedLeads = [...leads].sort((a, b) => {
        if (!a.follow_up_date && !b.follow_up_date) return 0
        if (!a.follow_up_date) return 1
        if (!b.follow_up_date) return -1
        return new Date(a.follow_up_date).getTime() - new Date(b.follow_up_date).getTime()
    })

    return (
        <div className="flex-shrink-0 w-80">
            {/* Column Header */}
            <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${columnColors[id] || color}`} />
                    <h3 className="font-semibold text-sm">{title}</h3>
                </div>
                <Badge variant="secondary" className="text-xs">
                    {leads.length}
                </Badge>
            </div>

            {/* Column Content */}
            <div
                ref={setNodeRef}
                className={`min-h-[500px] p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border-2 border-dashed transition-colors ${isOver
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-transparent'
                    }`}
            >
                <SortableContext items={sortedLeads.map(l => l.id)} strategy={verticalListSortingStrategy}>
                    {sortedLeads.length === 0 ? (
                        <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
                            No leads
                        </div>
                    ) : (
                        sortedLeads.map((lead) => (
                            <LeadCard
                                key={lead.id}
                                property={lead}
                                isSelected={selectedIds.has(lead.id)}
                                isSelectionMode={isSelectionMode}
                                onSelect={onSelect}
                                onUpdate={onUpdate}
                            />
                        ))
                    )}
                </SortableContext>
            </div>
        </div>
    )
}
