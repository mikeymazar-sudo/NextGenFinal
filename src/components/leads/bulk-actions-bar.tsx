'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { X, Trash2, ArrowRight, Flag, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface BulkActionsBarProps {
    selectedCount: number
    selectedIds: Set<string>
    onClear: () => void
    onUpdate: () => void
}

const STATUSES = [
    { value: 'new', label: 'New' },
    { value: 'warm', label: 'Warm' },
    { value: 'reach_out', label: 'Reach Out' },
    { value: 'closed', label: 'Closed' },
]

const PRIORITIES = [
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
]

export function BulkActionsBar({
    selectedCount,
    selectedIds,
    onClear,
    onUpdate,
}: BulkActionsBarProps) {
    const [isUpdating, setIsUpdating] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)

    const handleBulkStatusChange = async (status: string) => {
        setIsUpdating(true)
        const supabase = createClient()

        const { error } = await supabase
            .from('properties')
            .update({
                status,
                status_changed_at: new Date().toISOString(),
            })
            .in('id', Array.from(selectedIds))

        if (error) {
            toast.error('Failed to update status')
        } else {
            toast.success(`Updated ${selectedCount} leads to ${status}`)
            onClear()
            onUpdate()
        }
        setIsUpdating(false)
    }

    const handleBulkPriorityChange = async (priority: string) => {
        setIsUpdating(true)
        const supabase = createClient()

        const { error } = await supabase
            .from('properties')
            .update({ priority })
            .in('id', Array.from(selectedIds))

        if (error) {
            toast.error('Failed to update priority')
        } else {
            toast.success(`Updated ${selectedCount} leads to ${priority} priority`)
            onClear()
            onUpdate()
        }
        setIsUpdating(false)
    }

    const handleBulkDelete = async () => {
        setIsUpdating(true)
        const supabase = createClient()

        const { error } = await supabase
            .from('properties')
            .delete()
            .in('id', Array.from(selectedIds))

        if (error) {
            toast.error('Failed to delete leads')
        } else {
            toast.success(`Deleted ${selectedCount} leads`)
            onClear()
            onUpdate()
        }
        setIsUpdating(false)
        setShowDeleteDialog(false)
    }

    if (selectedCount === 0) return null

    return (
        <>
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-900 dark:bg-zinc-800 text-white shadow-2xl border border-zinc-700">
                    {/* Selection Count */}
                    <span className="text-sm font-medium">
                        {selectedCount} selected
                    </span>

                    <div className="w-px h-6 bg-zinc-600" />

                    {/* Status Change */}
                    <div className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-zinc-400" />
                        <Select onValueChange={handleBulkStatusChange} disabled={isUpdating}>
                            <SelectTrigger className="w-32 h-8 bg-zinc-800 border-zinc-600 text-white">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                {STATUSES.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>
                                        {s.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Priority Change */}
                    <div className="flex items-center gap-2">
                        <Flag className="h-4 w-4 text-zinc-400" />
                        <Select onValueChange={handleBulkPriorityChange} disabled={isUpdating}>
                            <SelectTrigger className="w-28 h-8 bg-zinc-800 border-zinc-600 text-white">
                                <SelectValue placeholder="Priority" />
                            </SelectTrigger>
                            <SelectContent>
                                {PRIORITIES.map((p) => (
                                    <SelectItem key={p.value} value={p.value}>
                                        {p.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="w-px h-6 bg-zinc-600" />

                    {/* Delete Button */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDeleteDialog(true)}
                        disabled={isUpdating}
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/30"
                    >
                        {isUpdating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Trash2 className="h-4 w-4" />
                        )}
                    </Button>

                    {/* Clear Selection */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClear}
                        disabled={isUpdating}
                        className="text-zinc-400 hover:text-white hover:bg-zinc-700"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {selectedCount} leads?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the
                            selected leads and all associated data including notes, contacts,
                            and activity history.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleBulkDelete}
                            disabled={isUpdating}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isUpdating ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Trash2 className="h-4 w-4 mr-2" />
                            )}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
