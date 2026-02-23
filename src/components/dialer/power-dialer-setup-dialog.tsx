'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Loader2, Zap, MessageSquare, RefreshCcw, Pencil, PhoneMissed } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/providers/auth-provider'
import { loadSmsTemplates, resolveTemplate } from '@/hooks/use-power-dialer'
import type { LeadList, PowerDialerSettings, PowerDialerLead } from '@/types/schema'

interface PowerDialerSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStart: (settings: PowerDialerSettings) => void
  onEditTemplates: () => void
}

const SAMPLE_PREVIEW: PowerDialerLead = {
  propertyId: '',
  address: '123 Main St',
  city: 'Tampa',
  state: 'FL',
  zip: '33601',
  ownerName: 'John Smith',
  ownerPhone: null,
  contactId: null,
  contactPhones: null,
  dialStatus: 'pending',
}

export function PowerDialerSetupDialog({
  open,
  onOpenChange,
  onStart,
  onEditTemplates,
}: PowerDialerSetupDialogProps) {
  const { user } = useAuth()
  const [lists, setLists] = useState<LeadList[]>([])
  const [loading, setLoading] = useState(false)
  const [leadCount, setLeadCount] = useState<number | null>(null)
  const [countLoading, setCountLoading] = useState(false)

  // Settings
  const [listId, setListId] = useState<string>('all_new')
  const [doubleDial, setDoubleDial] = useState(false)
  const [preSms, setPreSms] = useState(false)
  const [smsTemplateIndex, setSmsTemplateIndex] = useState(0)

  const [templates, setTemplates] = useState<string[]>([])

  // Fetch lead lists on open
  useEffect(() => {
    if (!open || !user) return

    const fetchLists = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('lead_lists')
        .select('*')
        .order('created_at', { ascending: false })

      if (data) setLists(data as LeadList[])
    }

    fetchLists()
    setTemplates(loadSmsTemplates())
    setLeadCount(null)
  }, [open, user])

  // Count leads when list selection changes
  useEffect(() => {
    if (!user) return

    const countLeads = async () => {
      setCountLoading(true)
      const supabase = createClient()

      let query = supabase
        .from('properties')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', user.id)
        .eq('has_been_answered', false)

      if (listId === 'all_new') {
        query = query.eq('status', 'new').is('last_called_at', null)
      } else if (listId === 'unanswered') {
        query = query.gt('unanswered_count', 0)
      } else {
        query = query.eq('list_id', listId)
      }

      const { count } = await query
      setLeadCount(count ?? 0)
      setCountLoading(false)
    }

    countLeads()
  }, [listId, user])

  const handleStart = () => {
    if (leadCount === 0) return
    setLoading(true)
    onStart({
      listId: listId === 'all_new' || listId === 'unanswered' ? null : listId,
      leadFilter: listId === 'unanswered' ? 'unanswered' : 'new',
      doubleDial,
      preSms,
      smsTemplateIndex,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Power Dialer Setup
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* List Selection */}
          <div className="space-y-2">
            <Label>Select Lead List</Label>
            <Select value={listId} onValueChange={setListId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a list..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_new">
                  All New Leads
                </SelectItem>
                <SelectItem value="unanswered">
                  <span className="flex items-center gap-2">
                    <PhoneMissed className="h-3.5 w-3.5 text-red-500" />
                    Unanswered Leads
                  </span>
                </SelectItem>
                {lists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Lead count preview */}
            <div className="h-5">
              {countLoading ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Counting...
                </span>
              ) : leadCount !== null ? (
                <span className="text-xs text-muted-foreground">
                  {leadCount === 0 ? (
                    <span className="text-red-500">No leads found in this list</span>
                  ) : (
                    <>{leadCount} lead{leadCount !== 1 ? 's' : ''} in this list</>
                  )}
                </span>
              ) : null}
            </div>
          </div>

          {/* Double Dial Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <RefreshCcw className="h-4 w-4 text-muted-foreground" />
                Double Dial
              </Label>
              <p className="text-xs text-muted-foreground">
                Auto-redial unanswered calls once
              </p>
            </div>
            <Switch checked={doubleDial} onCheckedChange={setDoubleDial} />
          </div>

          {/* Pre-Call SMS Toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  Send SMS Before Call
                </Label>
                <p className="text-xs text-muted-foreground">
                  Text lead before dialing
                </p>
              </div>
              <Switch checked={preSms} onCheckedChange={setPreSms} />
            </div>

            {/* Template Selector (shown when SMS enabled) */}
            {preSms && (
              <div className="pl-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Choose Template</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1 px-2"
                    onClick={onEditTemplates}
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                </div>
                {templates.map((tmpl, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSmsTemplateIndex(idx)}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${smsTemplateIndex === idx
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700'
                      : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                      }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={smsTemplateIndex === idx ? 'default' : 'secondary'}
                        className="text-[10px] h-4 px-1.5"
                      >
                        {idx + 1}
                      </Badge>
                      {smsTemplateIndex === idx && (
                        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Selected</span>
                      )}
                    </div>
                    <p className="text-muted-foreground line-clamp-2">
                      {resolveTemplate(tmpl, SAMPLE_PREVIEW)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleStart}
            disabled={loading || leadCount === 0 || countLoading}
            className="gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Start Dialing{leadCount ? ` (${leadCount})` : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
