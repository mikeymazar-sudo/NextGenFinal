'use client'

import { useState, useEffect } from 'react'
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
import { StickyNote, Send, Pencil, Trash2 } from 'lucide-react'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import type { Note } from '@/types/schema'

export function PropertyNotes({ propertyId }: { propertyId: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Edit modal state
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fetchNotes = async () => {
      const result = await api.getNotes(propertyId)
      if (result.data) {
        setNotes(result.data)
      }
      setLoading(false)
    }
    fetchNotes()
  }, [propertyId])

  const addNote = async () => {
    if (!content.trim()) return
    setSubmitting(true)

    const result = await api.createNote(propertyId, content.trim())
    setSubmitting(false)

    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      setNotes([result.data, ...notes])
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
      setNotes(notes.map(n => n.id === editingNote.id ? result.data! : n))
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
      setNotes(notes.filter(n => n.id !== editingNote.id))
      toast.success('Note deleted')
      closeEditModal()
    }
  }

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-yellow-500" />
            Notes
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
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No notes yet.
            </p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {notes.map((note) => {
                const initials = note.user?.full_name
                  ? note.user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                  : '??'

                return (
                  <div
                    key={note.id}
                    onClick={() => openEditModal(note)}
                    className="flex gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer transition-colors group"
                  >
                    <Avatar className="h-7 w-7 flex-shrink-0">
                      <AvatarFallback className="text-[10px] bg-zinc-100 dark:bg-zinc-800">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{note.user?.full_name || 'Unknown'}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                        </span>
                        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap line-clamp-3">{note.content}</p>
                    </div>
                  </div>
                )
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
