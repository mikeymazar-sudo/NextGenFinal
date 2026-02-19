'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, Phone, SkipForward, MapPin, User } from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import type { PowerDialerLead, PhoneEntry } from '@/types/schema'

interface PowerDialerSkipTraceDialogProps {
  open: boolean
  lead: PowerDialerLead | null
  onSkip: () => void
  onPhoneFound: (phones: string[]) => void
  onOpenChange: (open: boolean) => void
}

export function PowerDialerSkipTraceDialog({
  open,
  lead,
  onSkip,
  onPhoneFound,
  onOpenChange,
}: PowerDialerSkipTraceDialogProps) {
  const [loading, setLoading] = useState(false)
  const [foundPhones, setFoundPhones] = useState<string[]>([])
  const [notFound, setNotFound] = useState(false)

  const handleSkipTrace = async () => {
    if (!lead) return

    setLoading(true)
    setFoundPhones([])
    setNotFound(false)

    try {
      const result = await api.skipTrace(
        lead.propertyId,
        lead.ownerName || '',
        lead.address,
        lead.city || '',
        lead.state || '',
        lead.zip || ''
      )

      if (result.error) {
        toast.error('Skip trace failed: ' + result.error)
        setNotFound(true)
        setLoading(false)
        return
      }

      if (result.data && result.data.length > 0) {
        // Extract phone numbers from contacts
        const phones: string[] = []
        for (const contact of result.data) {
          if (contact.phone_numbers) {
            for (const p of contact.phone_numbers) {
              if (typeof p === 'string' && p.trim()) {
                phones.push(p)
              } else if (typeof p === 'object' && (p as PhoneEntry).value) {
                phones.push((p as PhoneEntry).value)
              }
            }
          }
        }

        if (phones.length > 0) {
          setFoundPhones(phones)
        } else {
          setNotFound(true)
        }
      } else {
        setNotFound(true)
      }
    } catch {
      toast.error('Skip trace failed')
      setNotFound(true)
    }

    setLoading(false)
  }

  const handleUsePhone = (phone: string) => {
    onPhoneFound([phone, ...foundPhones.filter(p => p !== phone)])
  }

  const handleClose = () => {
    setFoundPhones([])
    setNotFound(false)
    setLoading(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-amber-500" />
            No Phone Number
          </DialogTitle>
        </DialogHeader>

        {lead && (
          <div className="space-y-4">
            {/* Lead Info */}
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border space-y-1.5">
              {lead.ownerName && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{lead.ownerName}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                <span>{lead.address}{lead.city ? `, ${lead.city}` : ''}{lead.state ? `, ${lead.state}` : ''}</span>
              </div>
            </div>

            {/* Not yet searched */}
            {!loading && foundPhones.length === 0 && !notFound && (
              <div className="text-center py-2">
                <p className="text-sm text-muted-foreground mb-3">
                  This lead has no phone number on file. Run a skip trace to find contact info.
                </p>
                <Button onClick={handleSkipTrace} className="gap-2">
                  <Search className="h-4 w-4" />
                  Run Skip Trace
                </Button>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="text-center py-4">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-500 mb-2" />
                <p className="text-sm text-muted-foreground">Searching for contact info...</p>
              </div>
            )}

            {/* Found phones */}
            {foundPhones.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-green-600 dark:text-green-400">
                  Found {foundPhones.length} phone number{foundPhones.length !== 1 ? 's' : ''}!
                </p>
                {foundPhones.map((phone, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleUsePhone(phone)}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg border hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-mono">{phone}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      Use & Call
                    </Badge>
                  </button>
                ))}
              </div>
            )}

            {/* Not found */}
            {notFound && (
              <div className="text-center py-2">
                <p className="text-sm text-muted-foreground">
                  No phone numbers found for this lead.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => { handleClose(); onSkip() }}
            className="gap-1.5"
          >
            <SkipForward className="h-3.5 w-3.5" />
            Skip This Lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
