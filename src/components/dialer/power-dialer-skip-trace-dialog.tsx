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
import { Loader2, Search, Phone, SkipForward, MapPin, User, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import type { PowerDialerLead, PhoneEntry } from '@/types/schema'

interface PowerDialerSkipTraceDialogProps {
  open: boolean
  lead: PowerDialerLead | null
  disconnectedNumber?: string | null
  onSkip: () => void
  onPhoneFound: (phones: string[]) => void
  onOpenChange: (open: boolean) => void
}

export function PowerDialerSkipTraceDialog({
  open,
  lead,
  disconnectedNumber,
  onSkip,
  onPhoneFound,
  onOpenChange,
}: PowerDialerSkipTraceDialogProps) {
  const [loading, setLoading] = useState(false)
  const [foundPhones, setFoundPhones] = useState<string[]>([])
  const [notFound, setNotFound] = useState(false)

  // Collect existing alternate phones from the lead (excluding the disconnected number)
  const getAlternatePhones = (): string[] => {
    if (!lead) return []
    const phones: string[] = []
    if (lead.contactPhones && lead.contactPhones.length > 0) {
      for (const p of lead.contactPhones) {
        if (typeof p === 'string' && p.trim()) {
          phones.push(p)
        } else if (typeof p === 'object' && (p as PhoneEntry).value) {
          phones.push((p as PhoneEntry).value)
        }
      }
    }
    if (lead.ownerPhone && lead.ownerPhone.length > 0) {
      for (const p of lead.ownerPhone) {
        if (p.trim() && !phones.includes(p)) {
          phones.push(p)
        }
      }
    }
    // Filter out the disconnected number
    if (disconnectedNumber) {
      const normalizedDisconnected = disconnectedNumber.replace(/\D/g, '')
      return phones.filter(p => {
        const normalized = p.replace(/\D/g, '')
        return normalized !== normalizedDisconnected &&
          `1${normalized}` !== normalizedDisconnected &&
          normalized !== `1${normalizedDisconnected}`
      })
    }
    return phones
  }

  const alternatePhones = disconnectedNumber ? getAlternatePhones() : []

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

        // Filter out the disconnected number from results
        const filteredPhones = disconnectedNumber
          ? phones.filter(p => {
            const normalizedDisconnected = disconnectedNumber.replace(/\D/g, '')
            const normalized = p.replace(/\D/g, '')
            return normalized !== normalizedDisconnected &&
              `1${normalized}` !== normalizedDisconnected &&
              normalized !== `1${normalizedDisconnected}`
          })
          : phones

        if (filteredPhones.length > 0) {
          setFoundPhones(filteredPhones)
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

  const handleUseAlternatePhone = (phone: string) => {
    onPhoneFound([phone])
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
            {disconnectedNumber ? (
              <>
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Number Not In Service
              </>
            ) : (
              <>
                <Phone className="h-4 w-4 text-amber-500" />
                No Phone Number
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {lead && (
          <div className="space-y-4">
            {/* Disconnected Number Banner */}
            {disconnectedNumber && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50">
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  <div>
                    <p className="font-medium text-red-700 dark:text-red-400">
                      {disconnectedNumber} is not in service
                    </p>
                    <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-0.5">
                      This number failed to connect after 2 attempts
                    </p>
                  </div>
                </div>
              </div>
            )}

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

            {/* Alternate Numbers Available (when disconnected) */}
            {disconnectedNumber && alternatePhones.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  {alternatePhones.length} other number{alternatePhones.length !== 1 ? 's' : ''} available:
                </p>
                {alternatePhones.map((phone, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleUseAlternatePhone(phone)}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg border hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-mono">{phone}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      Try This
                    </Badge>
                  </button>
                ))}
              </div>
            )}

            {/* No alternate numbers + disconnected → show skip trace */}
            {disconnectedNumber && alternatePhones.length === 0 && !loading && foundPhones.length === 0 && !notFound && (
              <div className="text-center py-2">
                <p className="text-sm text-muted-foreground mb-3">
                  No other numbers on file. Run a skip trace to find new contact info.
                </p>
                <Button onClick={handleSkipTrace} className="gap-2">
                  <Search className="h-4 w-4" />
                  Run Skip Trace
                </Button>
              </div>
            )}

            {/* Not yet searched (original no-phone-number case) */}
            {!disconnectedNumber && !loading && foundPhones.length === 0 && !notFound && (
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

            {/* Found phones from skip trace */}
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
