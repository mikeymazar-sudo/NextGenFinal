'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Search, Filter, X, CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/providers/auth-provider'
import type { LeadList } from '@/types/schema'

export interface LeadsFilters {
    search: string
    priority: string
    listId: string
    followUpFrom: Date | undefined
    followUpTo: Date | undefined
}

interface LeadsFilterPanelProps {
    filters: LeadsFilters
    onFiltersChange: (filters: LeadsFilters) => void
}

export function LeadsFilterPanel({ filters, onFiltersChange }: LeadsFilterPanelProps) {
    const [lists, setLists] = useState<LeadList[]>([])
    const [showFilters, setShowFilters] = useState(false)
    const { user } = useAuth()

    useEffect(() => {
        if (!user) return

        const fetchLists = async () => {
            const supabase = createClient()
            const { data } = await supabase
                .from('lead_lists')
                .select('*')
                .order('created_at', { ascending: false })

            if (data) {
                setLists(data as LeadList[])
            }
        }

        fetchLists()
    }, [user])

    const updateFilter = <K extends keyof LeadsFilters>(key: K, value: LeadsFilters[K]) => {
        onFiltersChange({ ...filters, [key]: value })
    }

    const clearFilters = () => {
        onFiltersChange({
            search: '',
            priority: 'all',
            listId: 'all',
            followUpFrom: undefined,
            followUpTo: undefined,
        })
    }

    const hasActiveFilters =
        filters.priority !== 'all' ||
        filters.listId !== 'all' ||
        filters.followUpFrom ||
        filters.followUpTo

    return (
        <div className="space-y-3">
            {/* Search Bar */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by address, city, owner, or list name..."
                        value={filters.search}
                        onChange={(e) => updateFilter('search', e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Button
                    variant={showFilters || hasActiveFilters ? 'secondary' : 'outline'}
                    onClick={() => setShowFilters(!showFilters)}
                    className="gap-2"
                >
                    <Filter className="h-4 w-4" />
                    Filters
                    {hasActiveFilters && (
                        <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs text-white">
                            !
                        </span>
                    )}
                </Button>
            </div>

            {/* Expandable Filters */}
            {showFilters && (
                <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border">
                    {/* Priority Filter */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Priority:</span>
                        <Select value={filters.priority} onValueChange={(v) => updateFilter('priority', v)}>
                            <SelectTrigger className="w-28 h-8">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="low">Low</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* List Filter */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">List:</span>
                        <Select value={filters.listId} onValueChange={(v) => updateFilter('listId', v)}>
                            <SelectTrigger className="w-40 h-8">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Lists</SelectItem>
                                {lists.map((list) => (
                                    <SelectItem key={list.id} value={list.id}>
                                        {list.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Follow-up Date Range */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Follow-up:</span>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 gap-2">
                                    <CalendarIcon className="h-4 w-4" />
                                    {filters.followUpFrom
                                        ? format(filters.followUpFrom, 'MMM d')
                                        : 'From'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={filters.followUpFrom}
                                    onSelect={(d) => updateFilter('followUpFrom', d)}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                        <span className="text-sm text-muted-foreground">-</span>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 gap-2">
                                    <CalendarIcon className="h-4 w-4" />
                                    {filters.followUpTo ? format(filters.followUpTo, 'MMM d') : 'To'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={filters.followUpTo}
                                    onSelect={(d) => updateFilter('followUpTo', d)}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Clear Filters */}
                    {hasActiveFilters && (
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1">
                            <X className="h-4 w-4" />
                            Clear
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}
