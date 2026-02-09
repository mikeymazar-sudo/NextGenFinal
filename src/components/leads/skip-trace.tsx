'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  UserSearch,
  Phone,
  Mail,
  Loader2,
  RefreshCw,
  User,
  CheckCircle2,
  Copy,
  MapPin,
  Plus,
  MoreVertical,
  Star,
  Pencil,
  Trash2,
} from 'lucide-react'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import type { Contact, PhoneEntry, EmailEntry } from '@/types/schema'

interface SkipTraceProps {
  propertyId: string
  ownerName: string | null
  address: string
  city: string | null
  state: string | null
  zip: string | null
  existingContacts: Contact[]
  status?: string
  sqft?: number | null
  yearBuilt?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  lotSize?: number | null
  propertyType?: string | null
  listPrice?: number | null
}

// Helper to normalize phone/email entries (handles both old string[] and new object[] formats)
function normalizePhoneEntries(phones: PhoneEntry[] | string[]): PhoneEntry[] {
  if (!phones || phones.length === 0) return []
  if (typeof phones[0] === 'string') {
    return (phones as string[]).map((value, i) => ({
      value,
      label: 'mobile' as const,
      is_primary: i === 0,
    }))
  }
  return phones as PhoneEntry[]
}

function normalizeEmailEntries(emails: EmailEntry[] | string[]): EmailEntry[] {
  if (!emails || emails.length === 0) return []
  if (typeof emails[0] === 'string') {
    return (emails as string[]).map((value, i) => ({
      value,
      label: 'personal' as const,
      is_primary: i === 0,
    }))
  }
  return emails as EmailEntry[]
}

export function SkipTrace({ propertyId, ownerName, address, city, state, zip, existingContacts, status, sqft, yearBuilt, bedrooms, bathrooms, lotSize, propertyType, listPrice }: SkipTraceProps) {
  const [contacts, setContacts] = useState<Contact[]>(existingContacts)
  const [loading, setLoading] = useState(false)
  const [selectedPhone, setSelectedPhone] = useState<string>('')
  const [selectedEmail, setSelectedEmail] = useState<string>('')

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleCall = (phone: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('dial_number', phone)
    router.push(`${pathname}?${params.toString()}`)
  }

  // Add/Edit modal states
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addModalType, setAddModalType] = useState<'phone' | 'email'>('phone')
  const [addValue, setAddValue] = useState('')
  const [addLabel, setAddLabel] = useState<string>('mobile')
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const contactId = contacts[0]?.id

  // Get all phones and emails from all contacts
  const allPhones = normalizePhoneEntries(contacts.flatMap(c => (c.phone_numbers || []) as any[]))
  const allEmails = normalizeEmailEntries(contacts.flatMap(c => (c.emails || []) as any[]))

  // Get mailing address from raw response if available
  const rawData = contacts[0]?.raw_batchdata_response as Record<string, unknown> | undefined
  const mailingAddress = rawData?.mailingAddress as Record<string, string> | undefined

  // Get primary entries
  const primaryPhone = allPhones.find(p => p.is_primary) || allPhones[0]
  const primaryEmail = allEmails.find(e => e.is_primary) || allEmails[0]

  // Set initial selections
  useEffect(() => {
    if (allPhones.length > 0 && !selectedPhone) {
      setSelectedPhone(primaryPhone?.value || allPhones[0].value)
    }
    if (allEmails.length > 0 && !selectedEmail) {
      setSelectedEmail(primaryEmail?.value || allEmails[0].value)
    }
  }, [allPhones, allEmails, selectedPhone, selectedEmail, primaryPhone, primaryEmail])

  const runSkipTrace = async (force?: boolean) => {
    setLoading(true)
    const result = await api.skipTrace(propertyId, ownerName || '', address, city || '', state || '', zip || '', force)
    setLoading(false)

    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      setContacts(result.data)
      // Reset selections for new data
      setSelectedPhone('')
      setSelectedEmail('')
      if (result.data.length === 0) {
        toast.info('No contact information found.')
      } else {
        toast.success(force ? 'Contacts refreshed!' : `Found ${result.data.length} contact(s)!`)
      }
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied!`)
  }

  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    }
    return phone
  }

  const openAddModal = (type: 'phone' | 'email') => {
    setAddModalType(type)
    setAddValue('')
    setAddLabel(type === 'phone' ? 'mobile' : 'personal')
    setEditIndex(null)
    setAddModalOpen(true)
  }

  const openEditModal = (type: 'phone' | 'email', index: number, entry: PhoneEntry | EmailEntry) => {
    setAddModalType(type)
    setAddValue(entry.value)
    setAddLabel(entry.label)
    setEditIndex(index)
    setAddModalOpen(true)
  }

  const handleSaveContact = async () => {
    if (!addValue.trim()) {
      toast.error('Please enter a value')
      return
    }

    setSaving(true)

    if (editIndex !== null && contactId) {
      // Update existing entry
      const result = await api.updateContact(contactId, addModalType, editIndex, {
        value: addValue.trim(),
        label: addLabel,
      })

      if (result.error) {
        toast.error(result.error)
      } else if (result.data) {
        setContacts([result.data])
        toast.success(`${addModalType === 'phone' ? 'Phone' : 'Email'} updated!`)
        setAddModalOpen(false)
      }
    } else {
      // Add new entry
      const result = await api.addContact(propertyId, addModalType, addValue.trim(), addLabel)

      if (result.error) {
        toast.error(result.error)
      } else if (result.data) {
        setContacts([result.data])
        toast.success(`${addModalType === 'phone' ? 'Phone' : 'Email'} added!`)
        setAddModalOpen(false)
        // Select the newly added entry
        addModalType === 'phone' ? setSelectedPhone(addValue.trim()) : setSelectedEmail(addValue.trim())
      }
    }

    setSaving(false)
  }

  const handleSetPrimary = async (type: 'phone' | 'email', index: number) => {
    if (!contactId) return

    const result = await api.updateContact(contactId, type, index, { is_primary: true })

    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      setContacts([result.data])
      toast.success(`Set as primary ${type}!`)
    }
  }

  const handleDelete = async (type: 'phone' | 'email', index: number) => {
    if (!contactId) return

    const result = await api.deleteContact(contactId, type, index)

    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      setContacts([result.data])
      toast.success(`${type === 'phone' ? 'Phone' : 'Email'} removed!`)
    }
  }

  // Phone labels
  const phoneLabels = [
    { value: 'mobile', label: 'Mobile' },
    { value: 'work', label: 'Work' },
    { value: 'home', label: 'Home' },
  ]

  // Email labels
  const emailLabels = [
    { value: 'personal', label: 'Personal' },
    { value: 'business', label: 'Business' },
  ]

  // No contacts yet - show search prompt
  if (contacts.length === 0 && !loading) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-base">Owner Info</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {ownerName || 'Unknown Owner'}
                </p>
              </div>
            </div>
          </div>

          {/* Property Info */}
          <div className="mt-3 pt-3 border-t space-y-3">
            {/* Owner Name as Primary Header */}
            <div>
              <h1 className="text-xl font-bold">{ownerName || 'Unknown Owner'}</h1>
              <h2 className="text-base font-medium text-muted-foreground">{address}</h2>
              <p className="text-sm text-muted-foreground">
                {[city, state, zip].filter(Boolean).join(', ')}
              </p>
            </div>

            {/* Key Stats Row */}
            <div className="flex flex-wrap gap-4 text-sm">
              {bedrooms !== null && bedrooms !== undefined && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">🛏️</span>
                  <span className="font-medium">{bedrooms}</span>
                  <span className="text-muted-foreground text-xs">beds</span>
                </div>
              )}
              {bathrooms !== null && bathrooms !== undefined && (
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">🛁</span>
                  <span className="font-medium">{bathrooms}</span>
                  <span className="text-muted-foreground text-xs">baths</span>
                </div>
              )}
              {sqft && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">📐</span>
                  <span className="font-medium">{Number(sqft).toLocaleString()}</span>
                  <span className="text-muted-foreground text-xs">sqft</span>
                </div>
              )}
              {yearBuilt && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">📅</span>
                  <span className="font-medium">{yearBuilt}</span>
                  <span className="text-muted-foreground text-xs">built</span>
                </div>
              )}
            </div>

            {/* Additional Details Row */}
            <div className="flex flex-wrap gap-3 text-xs">
              {status && (
                <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded capitalize">{status}</span>
              )}
              {propertyType && (
                <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded">{propertyType}</span>
              )}
              {lotSize && (
                <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded">
                  Lot: {Number(lotSize).toLocaleString()} sqft
                </span>
              )}
              {listPrice && (
                <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded font-medium">
                  ${Number(listPrice).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center space-y-4 py-4 border-t">
            <div className="mx-auto w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <UserSearch className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold">Skip Trace Owner</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Find phone numbers, emails, and mailing address
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => runSkipTrace()}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <UserSearch className="mr-2 h-4 w-4" />
                Run Skip Trace
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={() => openAddModal('phone')}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Phone
                </Button>
                <Button
                  onClick={() => openAddModal('email')}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Email
                </Button>
              </div>
            </div>
          </div>
        </CardContent>

        {/* Add/Edit Modal */}
        <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editIndex !== null ? 'Edit' : 'Add'} {addModalType === 'phone' ? 'Phone Number' : 'Email Address'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Input
                placeholder={addModalType === 'phone' ? 'Enter phone number' : 'Enter email address'}
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
              />
              <Select value={addLabel} onValueChange={setAddLabel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(addModalType === 'phone' ? phoneLabels : emailLabels).map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveContact} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editIndex !== null ? 'Save' : 'Add'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>
    )
  }

  // Loading state
  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="py-12">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto" />
            <p className="text-sm text-muted-foreground">Searching databases...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Has contacts - show results
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle className="text-base">Owner Info</CardTitle>
              <p className="text-xs text-muted-foreground">
                {contacts[0]?.name || ownerName || 'Unknown Owner'}
              </p>
            </div>
          </div>
          <Button
            onClick={() => runSkipTrace(true)}
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
          >
            <RefreshCw className="mr-1.5 h-3 w-3" />
            Refresh
          </Button>
        </div>

        {/* Property Info */}
        <div className="mt-3 pt-3 border-t space-y-3">
          {/* Owner Name as Primary Header */}
          <div>
            <h1 className="text-xl font-bold">{contacts[0]?.name || ownerName || 'Unknown Owner'}</h1>
            <h2 className="text-base font-medium text-muted-foreground">{address}</h2>
            <p className="text-sm text-muted-foreground">
              {[city, state, zip].filter(Boolean).join(', ')}
            </p>
          </div>

          {/* Key Stats Row */}
          <div className="flex flex-wrap gap-4 text-sm">
            {bedrooms !== null && bedrooms !== undefined && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">🛏️</span>
                <span className="font-medium">{bedrooms}</span>
                <span className="text-muted-foreground text-xs">beds</span>
              </div>
            )}
            {bathrooms !== null && bathrooms !== undefined && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">🛁</span>
                <span className="font-medium">{bathrooms}</span>
                <span className="text-muted-foreground text-xs">baths</span>
              </div>
            )}
            {sqft && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">📐</span>
                <span className="font-medium">{Number(sqft).toLocaleString()}</span>
                <span className="text-muted-foreground text-xs">sqft</span>
              </div>
            )}
            {yearBuilt && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">📅</span>
                <span className="font-medium">{yearBuilt}</span>
                <span className="text-muted-foreground text-xs">built</span>
              </div>
            )}
          </div>

          {/* Additional Details Row */}
          <div className="flex flex-wrap gap-3 text-xs">
            {status && (
              <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded capitalize">{status}</span>
            )}
            {propertyType && (
              <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded">{propertyType}</span>
            )}
            {lotSize && (
              <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded">
                Lot: {Number(lotSize).toLocaleString()} sqft
              </span>
            )}
            {listPrice && (
              <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded font-medium">
                ${Number(listPrice).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Phone Number Dropdown */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            Phone Numbers ({allPhones.length})
          </label>
          <div className="flex gap-2">
            <Select value={selectedPhone} onValueChange={setSelectedPhone}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select phone number">
                  {selectedPhone && formatPhone(selectedPhone)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {allPhones.map((phone, i) => (
                  <div key={i} className="flex items-center justify-between pr-2">
                    <SelectItem value={phone.value} className="flex-1">
                      <div className="flex items-center gap-2">
                        <span>{formatPhone(phone.value)}</span>
                        {phone.is_primary && (
                          <Badge variant="secondary" className="text-xs px-1 py-0">Primary</Badge>
                        )}
                        <Badge variant="outline" className="text-xs px-1 py-0 capitalize">{phone.label}</Badge>
                      </div>
                    </SelectItem>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 ml-2">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!phone.is_primary && (
                          <DropdownMenuItem onClick={() => handleSetPrimary('phone', i)}>
                            <Star className="mr-2 h-4 w-4" />
                            Set as Primary
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => openEditModal('phone', i, phone)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete('phone', i)}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
                <DropdownMenuSeparator />
                <div
                  className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded-sm"
                  onClick={() => openAddModal('phone')}
                >
                  <Plus className="h-4 w-4" />
                  Add Phone Number
                </div>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(selectedPhone, 'Phone')}
              disabled={!selectedPhone}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          {/* Call Button */}
          {selectedPhone && (
            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={() => handleCall(selectedPhone)}
            >
              <Phone className="mr-2 h-4 w-4" />
              Call {formatPhone(selectedPhone)}
            </Button>
          )}

        </div>

        {/* Email Dropdown */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            Email Addresses ({allEmails.length})
          </label>
          <div className="flex gap-2">
            <Select value={selectedEmail} onValueChange={setSelectedEmail}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select email">
                  {selectedEmail}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {allEmails.map((email, i) => (
                  <div key={i} className="flex items-center justify-between pr-2">
                    <SelectItem value={email.value} className="flex-1">
                      <div className="flex items-center gap-2">
                        <span>{email.value}</span>
                        {email.is_primary && (
                          <Badge variant="secondary" className="text-xs px-1 py-0">Primary</Badge>
                        )}
                        <Badge variant="outline" className="text-xs px-1 py-0 capitalize">{email.label}</Badge>
                      </div>
                    </SelectItem>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 ml-2">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!email.is_primary && (
                          <DropdownMenuItem onClick={() => handleSetPrimary('email', i)}>
                            <Star className="mr-2 h-4 w-4" />
                            Set as Primary
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => openEditModal('email', i, email)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete('email', i)}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
                <DropdownMenuSeparator />
                <div
                  className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded-sm"
                  onClick={() => openAddModal('email')}
                >
                  <Plus className="h-4 w-4" />
                  Add Email Address
                </div>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(selectedEmail, 'Email')}
              disabled={!selectedEmail}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          {/* Email Button */}
          {selectedEmail && (
            <Button
              asChild
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <a href={`mailto:${selectedEmail}`}>
                <Mail className="mr-2 h-4 w-4" />
                Email {selectedEmail}
              </a>
            </Button>
          )}
        </div>

        {/* Mailing Address */}
        {mailingAddress && mailingAddress.street && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              Mailing Address
            </label>
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-3 py-2.5">
              <p className="text-sm font-medium">{mailingAddress.street}</p>
              <p className="text-sm text-muted-foreground">
                {mailingAddress.city}, {mailingAddress.state} {mailingAddress.zip}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-6 px-2 text-xs"
                onClick={() => copyToClipboard(
                  `${mailingAddress.street}, ${mailingAddress.city}, ${mailingAddress.state} ${mailingAddress.zip}`,
                  'Address'
                )}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
          </div>
        )}

        {/* Show message if no data */}
        {allPhones.length === 0 && allEmails.length === 0 && (
          <div className="text-center py-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              No contact information found
            </p>
            <div className="flex gap-2 justify-center">
              <Button
                onClick={() => openAddModal('phone')}
                variant="outline"
                size="sm"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Phone
              </Button>
              <Button
                onClick={() => openAddModal('email')}
                variant="outline"
                size="sm"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Email
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Add/Edit Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editIndex !== null ? 'Edit' : 'Add'} {addModalType === 'phone' ? 'Phone Number' : 'Email Address'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder={addModalType === 'phone' ? 'Enter phone number' : 'Enter email address'}
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
            />
            <Select value={addLabel} onValueChange={setAddLabel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(addModalType === 'phone' ? phoneLabels : emailLabels).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveContact} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editIndex !== null ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card >
  )
}
