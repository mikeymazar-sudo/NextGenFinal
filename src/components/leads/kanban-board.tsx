'use client'

import { useState, useCallback } from 'react'
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { KanbanColumn } from './kanban-column'
import { LeadCard } from './lead-card'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Property } from '@/types/schema'

interface KanbanBoardProps {
    leads: Property[]
    selectedIds: Set<string>
    onSelect: (id: string, selected: boolean) => void
    onUpdate: () => void
}

const COLUMNS = [
    { id: 'new', title: 'New', color: 'bg-blue-500' },
    { id: 'warm', title: 'Warm', color: 'bg-orange-500' },
    { id: 'reach_out', title: 'Reach Out', color: 'bg-purple-500' },
    { id: 'closed', title: 'Closed', color: 'bg-green-500' },
] as const

type ColumnId = typeof COLUMNS[number]['id']

export function KanbanBoard({ leads, selectedIds, onSelect, onUpdate }: KanbanBoardProps) {
    const [activeId, setActiveId] = useState<string | null>(null)

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    const getLeadsByStatus = (status: ColumnId): Property[] => {
        return leads.filter((lead) => {
            // Leads with a follow_up_date should appear in the Reach Out column
            if (lead.follow_up_date) {
                return status === 'reach_out'
            }
            // Otherwise, filter by actual status
            return lead.status === status
        })
    }

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string)
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event
        setActiveId(null)

        if (!over) return

        const leadId = active.id as string
        const lead = leads.find((l) => l.id === leadId)
        if (!lead) return

        // Determine the target column
        let targetStatus: ColumnId | null = null

        // Check if dropped on a column
        if (COLUMNS.some((col) => col.id === over.id)) {
            targetStatus = over.id as ColumnId
        } else {
            // Dropped on another card - find which column that card is in
            const targetLead = leads.find((l) => l.id === over.id)
            if (targetLead) {
                targetStatus = targetLead.status as ColumnId
            }
        }

        if (!targetStatus || targetStatus === lead.status) return

        // Update the lead status
        const supabase = createClient()
        const { error } = await supabase
            .from('properties')
            .update({
                status: targetStatus,
                status_changed_at: new Date().toISOString(),
            })
            .eq('id', leadId)

        if (error) {
            toast.error('Failed to update status')
        } else {
            const columnName = COLUMNS.find((c) => c.id === targetStatus)?.title || targetStatus
            toast.success(`Moved to ${columnName}`)
            onUpdate()
        }
    }

    const activeLead = activeId ? leads.find((l) => l.id === activeId) : null

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="flex gap-4 overflow-x-auto pb-4">
                {COLUMNS.map((column) => (
                    <KanbanColumn
                        key={column.id}
                        id={column.id}
                        title={column.title}
                        color={column.color}
                        leads={getLeadsByStatus(column.id)}
                        selectedIds={selectedIds}
                        onSelect={onSelect}
                        onUpdate={onUpdate}
                    />
                ))}
            </div>

            {/* Drag overlay for visual feedback */}
            <DragOverlay>
                {activeLead ? (
                    <div className="opacity-80">
                        <LeadCard
                            property={activeLead}
                            isSelected={false}
                            onSelect={() => { }}
                            onUpdate={() => { }}
                        />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    )
}
