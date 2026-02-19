'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { StickyNote, Send, Pencil, Trash2, Phone, FileText, Download, Copy, Loader2 } from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import type { Note, Call } from '@/types/schema'

type TimelineItem =
  | ({ type: 'note' } & Note)
  | ({ type: 'call' } & Call)

export function PropertyNotes({ propertyId }: { propertyId: string }) {
  const [items, setItems] = useState<TimelineItem[]>([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({})

  // Edit modal state
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    const [notesRes, callsRes] = await Promise.all([
      api.getNotes(propertyId),
      api.getCalls(propertyId)
    ])

    const combined: TimelineItem[] = []

    if (notesRes.data) {
      combined.push(...notesRes.data.map(n => ({ ...n, type: 'note' as const })))
    }
    if (callsRes.data) {
      combined.push(...callsRes.data.map(c => ({ ...c, type: 'call' as const })))
    }

    combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setItems(combined)
    setLoading(false)
  }, [propertyId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const addNote = async () => {
    if (!content.trim()) return
    setSubmitting(true)

    const result = await api.createNote(propertyId, content.trim())
    setSubmitting(false)

    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      const newItem: TimelineItem = { ...result.data, type: 'note' }
      setItems(prev => [newItem, ...prev])
      setContent('')
    }
  }

  const openEditModal = (note: Note) => {
    setEditingNote(note)
    setEditContent(note.content)
  }

  const closeEditModal = () => {
    setEditingNote(null)
    setEditContent('')
  }

  const saveNote = async () => {
    if (!editingNote || !editContent.trim()) return
    setSaving(true)

    const result = await api.updateNote(editingNote.id, editContent.trim())
    setSaving(false)

    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      setItems(prev => prev.map(item =>
        (item.type === 'note' && item.id === editingNote.id)
          ? { ...result.data!, type: 'note' }
          : item
      ))
      toast.success('Note updated')
      closeEditModal()
    }
  }

  const deleteNote = async () => {
    if (!editingNote) return
    setSaving(true)

    const result = await api.deleteNote(editingNote.id)
    setSaving(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      setItems(prev => prev.filter(item => item.id !== editingNote.id))
      toast.success('Note deleted')
      closeEditModal()
    }
  }

  const handleTranscribe = async (call: Call) => {
    setTranscribing(prev => ({ ...prev, [call.id]: true }))
    toast.info('Starting transcription...')

    const result = await api.transcribeCall(call.id)

    setTranscribing(prev => {
      const next = { ...prev }
      delete next[call.id]
      return next
    })

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Transcription complete')
      // Refresh data to show transcript
      fetchData()
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const handleDownload = (text: string, date: string) => {
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transcript-${date}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const formatDuration = (s: number | null) => {
    if (!s) return '0:00'
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-yellow-500" />
            Notes & Calls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Textarea
              placeholder="Add a note..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[80px] resize-none"
            />
            <Button
              onClick={addNote}
              disabled={submitting || !content.trim()}
              size="icon"
              className="flex-shrink-0 self-end"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No notes or calls yet.
            </p>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {items.map((item) => {
                if (item.type === 'note') {
                  const initials = item.user?.full_name
                    ? item.user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                    : '??'

                  return (
                    <div
                      key={item.id}
                      onClick={() => openEditModal(item)}
                      className="flex gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer transition-colors group"
                    >
                      <Avatar className="h-7 w-7 flex-shrink-0">
                        <AvatarFallback className="text-[10px] bg-zinc-100 dark:bg-zinc-800">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{item.user?.full_name || 'Unknown'}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                          </span>
                          <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap line-clamp-3">{item.content}</p>
                      </div>
                    </div>
                  )
                } else {
                  // Call Item (Blue Note)
                  return (
                    <div key={item.id} className="rounded-md border border-blue-100 bg-blue-50/50 dark:border-blue-900/50 dark:bg-blue-950/20 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                            <Phone className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-blue-900 dark:text-blue-100">
                              Outbound Call
                            </p>
                            <p className="text-[10px] text-blue-700/70 dark:text-blue-300/70">
                              {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })} &bull; {formatDuration(item.duration)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {item.transcript && (
                            <>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50" onClick={() => handleCopy(item.transcript!)}>
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50" onClick={() => handleDownload(item.transcript!, item.created_at)}>
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="pl-8">
                        {item.transcript ? (
                          <div className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                            {item.transcript}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {item.transcription_status === 'processing' || transcribing[item.id] ? (
                              <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Transcribing...
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs bg-white dark:bg-zinc-950 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/40"
                                onClick={() => handleTranscribe(item)}
                              >
                                <FileText className="h-3 w-3 mr-1.5" />
                                Transcribe Call (OpenAI)
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Note Modal */}
      <Dialog open={!!editingNote} onOpenChange={(open) => !open && closeEditModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[150px]"
            placeholder="Note content..."
          />
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="destructive"
              size="sm"
              onClick={deleteNote}
              disabled={saving}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={closeEditModal} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={saveNote} disabled={saving || !editContent.trim()}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
