'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
    GripVertical,
    Phone,
    PhoneMissed,
    StickyNote,
    Calendar as CalendarIcon,
    Flag,
    MoreHorizontal,
} from 'lucide-react'
import { format, formatDistanceToNow, isPast, isToday } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Property } from '@/types/schema'

interface LeadCardProps {
    property: Property
    isSelected: boolean
    isSelectionMode: boolean
    onSelect: (id: string, selected: boolean) => void
    onUpdate: () => void
}

const priorityColors = {
    high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
}

const priorityDots = {
    high: 'bg-red-500',
    medium: 'bg-yellow-500',
    low: 'bg-green-500',
}

export function LeadCard({ property, isSelected, isSelectionMode, onSelect, onUpdate }: LeadCardProps) {
    const [isUpdating, setIsUpdating] = useState(false)
    const [showDatePicker, setShowDatePicker] = useState(false)
    const [showPriorityMenu, setShowPriorityMenu] = useState(false)

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: property.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    }

    const handleFollowUpChange = async (date: Date | undefined) => {
        setIsUpdating(true)
        const supabase = createClient()

        const { error } = await supabase
            .from('properties')
            .update({ follow_up_date: date ? format(date, 'yyyy-MM-dd') : null })
            .eq('id', property.id)

        if (error) {
            toast.error('Failed to update follow-up date')
        } else {
            toast.success('Follow-up date updated')
            onUpdate()
        }
        setIsUpdating(false)
        setShowDatePicker(false)
    }

    const handlePriorityChange = async (priority: 'low' | 'medium' | 'high') => {
        setIsUpdating(true)
        const supabase = createClient()

        const { error } = await supabase
            .from('properties')
            .update({ priority })
            .eq('id', property.id)

        if (error) {
            toast.error('Failed to update priority')
        } else {
            toast.success('Priority updated')
            onUpdate()
        }
        setIsUpdating(false)
        setShowPriorityMenu(false)
    }

    const followUpDate = property.follow_up_date ? new Date(property.follow_up_date) : null
    const isOverdue = followUpDate && isPast(followUpDate) && !isToday(followUpDate)
    const isDueToday = followUpDate && isToday(followUpDate)

    return (
        <Card
            ref={setNodeRef}
            style={style}
            onClick={isSelectionMode ? () => onSelect(property.id, !isSelected) : undefined}
            className={`p-3 mb-2 bg-white dark:bg-zinc-900 border shadow-sm hover:shadow-md transition-all group ${isDragging ? 'shadow-lg ring-2 ring-blue-500' : ''
                } ${isSelected ? 'ring-2 ring-blue-500' : ''} ${isSelectionMode ? 'cursor-pointer' : ''}`}
        >
            <div className="flex items-start gap-2">
                {/* Drag Handle */}
                <div
                    {...attributes}
                    {...listeners}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity mt-1"
                >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>

                {/* Checkbox */}
                <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => onSelect(property.id, checked as boolean)}
                        className="mt-1"
                    />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <Link href={`/leads/${property.id}`} onClick={(e) => e.stopPropagation()} className="block">
                        <p className="text-sm font-medium truncate hover:text-blue-600 transition-colors">
                            {property.address}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                            {[property.city, property.state].filter(Boolean).join(', ')}
                        </p>
                    </Link>

                    {/* Badges Row */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {/* Priority Dot */}
                        {property.priority && (
                            <div
                                className={`w-2 h-2 rounded-full ${priorityDots[property.priority]}`}
                                title={`${property.priority} priority`}
                            />
                        )}

                        {/* List Badge */}
                        {property.list && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                                {property.list.name}
                            </Badge>
                        )}

                        {/* Follow-up Date */}
                        {followUpDate && (
                            <Badge
                                variant="secondary"
                                className={`text-xs px-1.5 py-0 ${isOverdue
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                    : isDueToday
                                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                        : ''
                                    }`}
                            >
                                <CalendarIcon className="h-3 w-3 mr-1" />
                                {formatDistanceToNow(followUpDate, { addSuffix: true })}
                            </Badge>
                        )}

                        {/* Price */}
                        {property.list_price && (
                            <span className="text-xs text-muted-foreground">
                                ${property.list_price.toLocaleString()}
                            </span>
                        )}

                        {/* Contacted Badge */}
                        {property.has_been_answered && (
                            <Badge
                                variant="secondary"
                                className="text-xs px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            >
                                <Phone className="h-3 w-3 mr-1" />
                                Contacted
                            </Badge>
                        )}

                        {/* Unanswered Badge */}
                        {property.unanswered_count > 0 && !property.has_been_answered && (
                            <Badge
                                variant="secondary"
                                className="text-xs px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            >
                                <PhoneMissed className="h-3 w-3 mr-1" />
                                Unanswered ×{property.unanswered_count}
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Quick Actions (visible on hover) */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    {/* Follow-up Date Picker */}
                    <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={isUpdating}
                            >
                                <CalendarIcon className="h-4 w-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                mode="single"
                                selected={followUpDate || undefined}
                                onSelect={handleFollowUpChange}
                                initialFocus
                            />
                            {followUpDate && (
                                <div className="p-2 border-t">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full"
                                        onClick={() => handleFollowUpChange(undefined)}
                                    >
                                        Clear date
                                    </Button>
                                </div>
                            )}
                        </PopoverContent>
                    </Popover>

                    {/* Priority Selector */}
                    <Popover open={showPriorityMenu} onOpenChange={setShowPriorityMenu}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={isUpdating}
                            >
                                <Flag className="h-4 w-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-32 p-1" align="end">
                            <div className="space-y-1">
                                {(['high', 'medium', 'low'] as const).map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => handlePriorityChange(p)}
                                        className={`w-full text-left px-2 py-1 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 ${property.priority === p ? 'bg-zinc-100 dark:bg-zinc-800' : ''
                                            }`}
                                    >
                                        <div className={`w-2 h-2 rounded-full ${priorityDots[p]}`} />
                                        {p.charAt(0).toUpperCase() + p.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* Notes Link */}
                    <Link href={`/leads/${property.id}#notes`} onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                            <StickyNote className="h-4 w-4" />
                        </Button>
                    </Link>
                </div>
            </div>
        </Card>
    )
}
