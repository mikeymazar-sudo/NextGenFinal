'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'
import type { CompFilterOptions } from '@/lib/api-client'

interface CompsFiltersProps {
    subjectBedrooms: number | null
    subjectBathrooms: number | null
    subjectSqft: number | null
    compType: 'rental' | 'sold'
    onFiltersChange: (filters: CompFilterOptions) => void
    defaultExpanded?: boolean
}

const RADIUS_OPTIONS = [
    { value: '0.5', label: '0.5 mi' },
    { value: '1', label: '1 mi' },
    { value: '2', label: '2 mi' },
    { value: '5', label: '5 mi' },
]

const COMP_COUNT_OPTIONS = [
    { value: '3', label: '3 comps' },
    { value: '5', label: '5 comps' },
    { value: '10', label: '10 comps' },
]

const DAYS_OLD_OPTIONS = [
    { value: '30', label: 'Last 30 days' },
    { value: '90', label: 'Last 3 months' },
    { value: '180', label: 'Last 6 months' },
    { value: '365', label: 'Last 12 months' },
]

const BEDS_OPTIONS = [
    { value: 'any', label: 'Any' },
    { value: '1', label: '1 bed' },
    { value: '2', label: '2 beds' },
    { value: '3', label: '3 beds' },
    { value: '4', label: '4 beds' },
    { value: '5', label: '5+ beds' },
]

const BATHS_OPTIONS = [
    { value: 'any', label: 'Any' },
    { value: '1', label: '1 bath' },
    { value: '2', label: '2 baths' },
    { value: '3', label: '3 baths' },
    { value: '4', label: '4+ baths' },
]

export function CompsFilters({
    subjectBedrooms,
    subjectBathrooms,
    subjectSqft,
    compType,
    onFiltersChange,
    defaultExpanded = false,
}: CompsFiltersProps) {
    const [expanded, setExpanded] = useState(defaultExpanded)
    const [radius, setRadius] = useState('1')
    const [compCount, setCompCount] = useState('5')
    const [daysOld, setDaysOld] = useState('180')

    // Property filters with defaults from subject (capped to max dropdown options)
    const getDefaultBeds = () => {
        if (!subjectBedrooms) return 'any'
        if (subjectBedrooms >= 5) return '5'
        return subjectBedrooms.toString()
    }
    const getDefaultBaths = () => {
        if (!subjectBathrooms) return 'any'
        if (subjectBathrooms >= 4) return '4'
        return subjectBathrooms.toString()
    }
    const [beds, setBeds] = useState(getDefaultBeds())
    const [baths, setBaths] = useState(getDefaultBaths())

    // Calculate default sqft range (±20%)
    const defaultSqftMin = subjectSqft ? Math.round(subjectSqft * 0.8) : ''
    const defaultSqftMax = subjectSqft ? Math.round(subjectSqft * 1.2) : ''
    const [sqftMin, setSqftMin] = useState(defaultSqftMin.toString())
    const [sqftMax, setSqftMax] = useState(defaultSqftMax.toString())

    const handleApplyFilters = () => {
        const filters: CompFilterOptions = {
            radius: parseFloat(radius),
            compCount: parseInt(compCount),
            daysOld: parseInt(daysOld),
        }

        // Add property filters if not "any"
        if (beds !== 'any') {
            filters.beds = parseInt(beds)
        }
        if (baths !== 'any') {
            filters.baths = parseInt(baths)
        }
        if (sqftMin) {
            filters.sqftMin = parseInt(sqftMin)
        }
        if (sqftMax) {
            filters.sqftMax = parseInt(sqftMax)
        }

        onFiltersChange(filters)
    }

    return (
        <div className="border rounded-lg">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors rounded-lg"
            >
                <span className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                    Filters
                </span>
                {expanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
            </button>

            {expanded && (
                <div className="px-3 pb-3 space-y-3 border-t">
                    <div className="pt-3 grid grid-cols-2 gap-3">
                        {/* Bedrooms */}
                        <div className="space-y-1">
                            <Label className="text-xs">Bedrooms</Label>
                            <Select value={beds} onValueChange={setBeds}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {BEDS_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Bathrooms */}
                        <div className="space-y-1">
                            <Label className="text-xs">Bathrooms</Label>
                            <Select value={baths} onValueChange={setBaths}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {BATHS_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Sqft Min */}
                        <div className="space-y-1">
                            <Label className="text-xs">Min Sqft</Label>
                            <Input
                                type="number"
                                value={sqftMin}
                                onChange={(e) => setSqftMin(e.target.value)}
                                placeholder="e.g. 1500"
                                className="h-8 text-xs"
                            />
                        </div>

                        {/* Sqft Max */}
                        <div className="space-y-1">
                            <Label className="text-xs">Max Sqft</Label>
                            <Input
                                type="number"
                                value={sqftMax}
                                onChange={(e) => setSqftMax(e.target.value)}
                                placeholder="e.g. 2500"
                                className="h-8 text-xs"
                            />
                        </div>

                        {/* Radius */}
                        <div className="space-y-1">
                            <Label className="text-xs">Search Radius</Label>
                            <Select value={radius} onValueChange={setRadius}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {RADIUS_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Comp Count */}
                        <div className="space-y-1">
                            <Label className="text-xs">Comp Count</Label>
                            <Select value={compCount} onValueChange={setCompCount}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {COMP_COUNT_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Date Range - for both rental and sold */}
                        <div className="space-y-1 col-span-2">
                            <Label className="text-xs">
                                {compType === 'sold' ? 'Sale Date Range' : 'Listing Date Range'}
                            </Label>
                            <Select value={daysOld} onValueChange={setDaysOld}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {DAYS_OLD_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Subject Property Reference */}
                    <div className="text-xs text-muted-foreground bg-zinc-50 dark:bg-zinc-800 rounded p-2">
                        <p>Subject: {subjectBedrooms || '?'} bd / {subjectBathrooms || '?'} ba / {subjectSqft?.toLocaleString() || '?'} sqft</p>
                    </div>

                    <Button onClick={handleApplyFilters} size="sm" className="w-full">
                        Apply & Fetch
                    </Button>
                </div>
            )}
        </div>
    )
}

