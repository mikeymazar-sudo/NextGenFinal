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
  Database,
  BedDouble,
  Bath,
  Ruler,
  Calendar,
  DollarSign,
  ChevronDown,
} from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { api } from '@/lib/api/client'
import { createClient } from '@/lib/supabase/client'
import { EmailComposer } from './email-composer'
import { format } from 'date-fns'
import { toast } from 'sonner'
import type { Contact, PhoneEntry, EmailEntry } from '@/types/schema'
import {
  normalizePropertyData,
  fmtCurrency,
  fmtDate,
  type NormalizedPropertyData,
} from '@/lib/property/data-utils'
import {
  WholesaleIndicators,
  FinancialOverview,
  SaleHistoryCard,
  MortgageHistoryCard,
  ForeclosureHistoryCard,
  TaxInfoCard,
  BuildingDetailsCard,
  LotLegalCard,
  DemographicsCard,
} from './property-details'

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
  realEstateData?: Record<string, any> | null
  onPropertyDataFetched?: (data: Record<string, any>) => void
}

// Helper to normalize phone/email entries (handles both old string[] and new object[] formats)
// Helper to normalize phone/email entries (handles both old string[] and new object[] formats)
function normalizePhoneEntries(phones: PhoneEntry[] | string[]): PhoneEntry[] {
  if (!phones || phones.length === 0) return []
  return phones.map((p, i) => {
    let entry: PhoneEntry

    if (typeof p === 'string') {
      // Check if it's a JSON string (starts with {)
      if (p.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(p)
          if (parsed && typeof parsed === 'object' && 'value' in parsed) {
            entry = parsed as PhoneEntry
          } else {
            entry = { value: p, label: 'mobile', is_primary: i === 0 }
          }
        } catch (e) {
          entry = { value: p, label: 'mobile', is_primary: i === 0 }
        }
      } else {
        entry = { value: p, label: 'mobile', is_primary: i === 0 }
      }
    } else {
      entry = p
    }

    // Double-check: if the value itself is a JSON object string, parse it too
    // This handles cases where DB stored '{"value":"..."}' inside the value field
    if (entry.value && typeof entry.value === 'string' && entry.value.trim().startsWith('{')) {
      try {
        const innerParsed = JSON.parse(entry.value)
        if (innerParsed && typeof innerParsed === 'object' && 'value' in innerParsed) {
          return innerParsed as PhoneEntry
        }
      } catch (e) {
        // Ignore
      }
    }

    return entry
  })
}

function normalizeEmailEntries(emails: EmailEntry[] | string[]): EmailEntry[] {
  if (!emails || emails.length === 0) return []
  return emails.map((e, i) => {
    let entry: EmailEntry

    if (typeof e === 'string') {
      // Check if it's a JSON string (starts with {)
      if (e.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(e)
          if (parsed && typeof parsed === 'object' && 'value' in parsed) {
            entry = parsed as EmailEntry
          } else {
            entry = { value: e, label: 'personal', is_primary: i === 0 }
          }
        } catch (error) {
          entry = { value: e, label: 'personal', is_primary: i === 0 }
        }
      } else {
        entry = { value: e, label: 'personal', is_primary: i === 0 }
      }
    } else {
      entry = e
    }

    // Double-check nested JSON string
    if (entry.value && typeof entry.value === 'string' && entry.value.trim().startsWith('{')) {
      try {
        const innerParsed = JSON.parse(entry.value)
        if (innerParsed && typeof innerParsed === 'object' && 'value' in innerParsed) {
          return innerParsed as EmailEntry
        }
      } catch (e) {
        // Ignore
      }
    }

    return entry
  })
}

// Quick stats displayed inside the Owner Info card
function OwnerQuickStats({
  d,
  bedrooms,
  bathrooms,
  sqft,
}: {
  d: NormalizedPropertyData | null
  bedrooms?: number | null
  bathrooms?: number | null
  sqft?: number | null
}) {
  const beds = d?.beds || bedrooms
  const baths = d?.bathsFull || bathrooms
  const sf = d?.livingSqft || sqft
  const lastSaleDate = d?.lastSaleDate
  const taxAmount = d?.taxAmount
  const estimatedValue = d?.estimatedValue
  const lastSalePrice = d?.lastSalePrice

  const hasAnything = beds || baths || sf || lastSaleDate || taxAmount || estimatedValue

  if (!hasAnything) return null

  return (
    <div className="mt-3 pt-3 border-t space-y-2">
      {/* Bed / Bath / Sqft row */}
      {(beds || baths || sf) && (
        <div className="flex flex-wrap gap-3">
          {beds && (
            <div className="flex items-center gap-1.5 text-sm">
              <BedDouble className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{beds}</span>
              <span className="text-muted-foreground text-xs">Beds</span>
            </div>
          )}
          {baths && (
            <div className="flex items-center gap-1.5 text-sm">
              <Bath className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{baths}</span>
              <span className="text-muted-foreground text-xs">Baths</span>
            </div>
          )}
          {sf && (
            <div className="flex items-center gap-1.5 text-sm">
              <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{Number(sf).toLocaleString()}</span>
              <span className="text-muted-foreground text-xs">Sqft</span>
            </div>
          )}
        </div>
      )}

      {/* Last Sale Date */}
      {lastSaleDate && (
        <div className="flex items-center gap-1.5 text-sm">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground text-xs">Last Sale:</span>
          <span className="font-medium">{fmtDate(lastSaleDate)}</span>
          {lastSalePrice && Number(lastSalePrice) > 0 && (
            <span className="text-muted-foreground text-xs">
              ({fmtCurrency(lastSalePrice)})
            </span>
          )}
        </div>
      )}

      {/* Tax Amount */}
      {taxAmount && Number(taxAmount) > 0 && (
        <div className="flex items-center gap-1.5 text-sm">
          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground text-xs">Tax:</span>
          <span className="font-medium">{fmtCurrency(taxAmount)}</span>
        </div>
      )}

      {/* Estimated Value + Estimated Tax at purchase price */}
      {estimatedValue && Number(estimatedValue) > 0 && (
        <div className="flex items-center gap-1.5 text-sm">
          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground text-xs">Est. Value:</span>
          <span className="font-medium text-green-600 dark:text-green-400">{fmtCurrency(estimatedValue)}</span>
          {taxAmount && Number(taxAmount) > 0 && lastSalePrice && Number(lastSalePrice) > 0 && (
            <span className="text-muted-foreground text-xs ml-1">
              (Est. tax at purchase: {fmtCurrency(Math.round((Number(taxAmount) / Number(estimatedValue)) * Number(lastSalePrice)))})
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// Collapsible wrapper for property detail sections — closed by default
function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between px-4 py-2.5 bg-card border rounded-lg shadow-sm hover:bg-accent/50 transition-colors">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {icon}
            {title}
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// Render property detail cards from normalized data — all collapsed by default
function PropertyDataCards({ d }: { d: NormalizedPropertyData }) {
  // Pre-check which sections have data (mirrors the null-checks inside each component)
  const hasWholesale = [d.ownerOccupied, d.absenteeOwner, d.corporateOwned, d.investorBuyer, d.highEquity, d.freeClear, d.inherited, d.vacant, d.preForeclosure, d.taxLien, d.bankOwned, d.deedInLieu, d.cashBuyer, d.cashSale, d.quitClaim, d.adjustableRate, d.assumable, d.mobileHome].some(Boolean) || d.floodZone || d.delinquentYear
  const hasFinancial = !!(d.estimatedEquity || d.estimatedValue || d.mortgageAmount || d.openMortgageBalance || d.estimatedMortgagePayment)
  const hasForeclosure = !!(d.foreclosureInfo && d.foreclosureInfo.length > 0)
  const hasSale = !!(d.saleHistory && d.saleHistory.length > 0) || !!(d.lastSalePrice || d.lastSaleDate)
  const hasMortgage = !!(d.mortgageHistory && d.mortgageHistory.length > 0)
  const hasTax = !!(d.taxAmount || d.assessedTotal || d.marketTotal)
  const hasBuilding = !!(d.condition || d.constructionType || d.wallType || d.coolingType || d.heatingType || d.garageType || d.pool || d.fireplace || d.basementType || d.airConditioning)
  const hasLot = !!(d.apn || d.zoningType || d.subdivision || d.legalDescription || d.landUse)
  const hasDemographics = !!(d.medianIncome || d.suggestedRent || d.fmrOneBedroom || d.fmrTwoBedroom || d.fmrThreeBedroom)

  return (
    <>
      {hasWholesale && (
        <CollapsibleSection title="Wholesale Indicators" icon={<DollarSign className="h-4 w-4 text-amber-500" />}>
          <WholesaleIndicators d={d} />
        </CollapsibleSection>
      )}
      {hasFinancial && (
        <CollapsibleSection title="Financial Overview" icon={<DollarSign className="h-4 w-4 text-green-600" />}>
          <FinancialOverview d={d} />
        </CollapsibleSection>
      )}
      {hasForeclosure && (
        <CollapsibleSection title="Foreclosure History" icon={<DollarSign className="h-4 w-4 text-red-600" />}>
          <ForeclosureHistoryCard d={d} />
        </CollapsibleSection>
      )}
      {hasSale && (
        <CollapsibleSection title="Sale History" icon={<Calendar className="h-4 w-4 text-indigo-500" />}>
          <SaleHistoryCard d={d} />
        </CollapsibleSection>
      )}
      {hasMortgage && (
        <CollapsibleSection title="Mortgage History" icon={<DollarSign className="h-4 w-4 text-violet-500" />}>
          <MortgageHistoryCard d={d} />
        </CollapsibleSection>
      )}
      {hasTax && (
        <CollapsibleSection title="Tax & Assessment" icon={<DollarSign className="h-4 w-4 text-slate-500" />}>
          <TaxInfoCard d={d} />
        </CollapsibleSection>
      )}
      {hasBuilding && (
        <CollapsibleSection title="Building Details" icon={<Ruler className="h-4 w-4 text-teal-500" />}>
          <BuildingDetailsCard d={d} />
        </CollapsibleSection>
      )}
      {hasLot && (
        <CollapsibleSection title="Lot & Legal" icon={<MapPin className="h-4 w-4 text-amber-600" />}>
          <LotLegalCard d={d} />
        </CollapsibleSection>
      )}
      {hasDemographics && (
        <CollapsibleSection title="Demographics & Market Rents" icon={<DollarSign className="h-4 w-4 text-cyan-500" />}>
          <DemographicsCard d={d} />
        </CollapsibleSection>
      )}
    </>
  )
}

export function SkipTrace({ propertyId, ownerName, address, city, state, zip, existingContacts, status, sqft, yearBuilt, bedrooms, bathrooms, lotSize, propertyType, listPrice, realEstateData, onPropertyDataFetched }: SkipTraceProps) {
  const [contacts, setContacts] = useState<Contact[]>(existingContacts)
  const [loading, setLoading] = useState(false)
  const [selectedPhone, setSelectedPhone] = useState<string>('')
  const [selectedEmail, setSelectedEmail] = useState<string>('')
  const [localRealEstateData, setLocalRealEstateData] = useState<Record<string, any> | null | undefined>(realEstateData)
  const [fetchingPropertyData, setFetchingPropertyData] = useState(false)
  const [showAllPhones, setShowAllPhones] = useState(false)
  const [showAllEmails, setShowAllEmails] = useState(false)

  // Sync local state when parent prop changes (e.g., initial load from DB)
  useEffect(() => {
    if (realEstateData && !localRealEstateData) {
      setLocalRealEstateData(realEstateData)
    }
  }, [realEstateData]) // eslint-disable-line react-hooks/exhaustive-deps

  // Normalize property data from RealEstateAPI
  const normalizedData = localRealEstateData ? normalizePropertyData(localRealEstateData) : null

  const fetchPropertyData = async () => {
    setFetchingPropertyData(true)
    try {
      const result = await api.lookupProperty(address, city || undefined, state || undefined, zip || undefined)

      if (result.error) {
        toast.error(result.error)
        return
      }

      if (!result.data) {
        toast.error('No response from property lookup')
        return
      }

      const rawData = (result.data as any).raw_realestate_data
      if (rawData) {
        setLocalRealEstateData(rawData)
        onPropertyDataFetched?.(rawData)
        toast.success(result.cached ? 'Property data loaded from cache' : 'Property data fetched!')
      } else {
        // raw_realestate_data is missing — the API may have returned the property
        // without enriched data. Try to construct a minimal wrapper so
        // normalizePropertyData can still extract what's available.
        const propData = result.data as any
        if (propData.owner_name || propData.sqft || propData.year_built) {
          // Build a minimal RealEstateAPI-shaped response from the saved property fields
          const syntheticRaw = {
            data: {
              ownerInfo: {
                owner1FullName: propData.owner_name || null,
              },
              propertyInfo: {
                bedrooms: propData.bedrooms,
                bathrooms: propData.bathrooms,
                livingSquareFeet: propData.sqft,
                yearBuilt: propData.year_built,
                propertyType: propData.property_type,
              },
              lotInfo: {
                lotSquareFeet: propData.lot_size,
              },
              taxInfo: {},
            }
          }
          setLocalRealEstateData(syntheticRaw)
          onPropertyDataFetched?.(syntheticRaw)
          toast.success('Property data loaded (basic info only)')
        } else {
          toast.error('RealEstateAPI did not return property data. Check your API key or try a different address.')
        }
      }
    } catch (err) {
      console.error('fetchPropertyData error:', err)
      toast.error('Failed to fetch property data')
    } finally {
      setFetchingPropertyData(false)
    }
  }

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleCall = (phone: string) => {
    // Create fresh params to avoid cluttering URL with existing filters/view/etc
    // We only need dial_number and auto_call for the dialer to work
    const params = new URLSearchParams()
    params.set('dial_number', phone)
    params.set('auto_call', 'true')

    // User requested ONLY phone number to be passed, so we don't set contact info here
    router.push(`${pathname}?${params.toString()}`)
  }

  // Add/Edit modal states
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addModalType, setAddModalType] = useState<'phone' | 'email'>('phone')
  const [addValue, setAddValue] = useState('')
  const [addLabel, setAddLabel] = useState<string>('mobile')
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // Email Composer state
  const [emailComposerOpen, setEmailComposerOpen] = useState(false)
  const [lastEmailed, setLastEmailed] = useState<string | null>(null)

  const contactId = contacts[0]?.id

  // Get all phones and emails from all contacts
  const allPhones = normalizePhoneEntries(contacts.flatMap(c => (c.phone_numbers || []) as any[]))
    .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
  const allEmails = normalizeEmailEntries(contacts.flatMap(c => (c.emails || []) as any[]))
    .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))

  // Get mailing address from raw response if available
  const rawData = contacts[0]?.raw_batchdata_response as Record<string, unknown> | undefined
  const mailingAddress = rawData?.mailingAddress as Record<string, string> | undefined

  // Get primary entries
  const primaryPhone = allPhones.find(p => p.is_primary) || allPhones[0]
  const primaryEmail = allEmails.find(e => e.is_primary) || allEmails[0]

  // Set initial selections and fetch email history
  useEffect(() => {
    if (allPhones.length > 0 && !selectedPhone) {
      setSelectedPhone(primaryPhone?.value || allPhones[0].value)
    }
    if (allEmails.length > 0 && !selectedEmail) {
      setSelectedEmail(primaryEmail?.value || allEmails[0].value)
    }
  }, [allPhones, allEmails, selectedPhone, selectedEmail, primaryPhone, primaryEmail])

  // Fetch last email date when selected email changes
  useEffect(() => {
    async function fetchLastEmail() {
      if (!selectedEmail) {
        setLastEmailed(null)
        return
      }

      const supabase = createClient()
      const { data } = await supabase
        .from('communication_logs')
        .select('created_at')
        .eq('recipient', selectedEmail)
        .eq('type', 'email')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (data) {
        setLastEmailed(data.created_at)
      } else {
        setLastEmailed(null)
      }
    }

    fetchLastEmail()
  }, [selectedEmail])

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

  const handleSetPrimary = async (type: 'phone' | 'email', value: string) => {
    if (!contactId) return

    // Find the correct DB index from the unsorted contact data (allPhones is sorted, so we can't use visual index)
    const contact = contacts[0]
    const rawEntries = type === 'phone'
      ? normalizePhoneEntries((contact?.phone_numbers || []) as any[])
      : normalizeEmailEntries((contact?.emails || []) as any[])
    const index = rawEntries.findIndex(e => e.value === value)
    if (index === -1) {
      toast.error('Could not find entry to update')
      return
    }

    const result = await api.updateContact(contactId, type, index, { is_primary: true })

    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      setContacts([result.data])
      // Update selection to the newly-set primary
      const updatedEntries = type === 'phone'
        ? normalizePhoneEntries((result.data.phone_numbers || []) as any[])
        : normalizeEmailEntries((result.data.emails || []) as any[])
      const newPrimary = updatedEntries.find(e => e.is_primary)
      if (newPrimary) {
        type === 'phone' ? setSelectedPhone(newPrimary.value) : setSelectedEmail(newPrimary.value)
      }
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

  // Derive display owner name from normalizedData if available
  const displayOwnerName = normalizedData?.ownerName || ownerName || 'Unknown Owner'
  const displayOwner2Name = normalizedData?.owner2Name || null
  const displayMailingAddress = normalizedData?.mailingAddress || null
  const isAbsenteeOwner = normalizedData?.absenteeOwner || false
  const isCorporateOwned = normalizedData?.corporateOwned || false
  const isOwnerOccupied = normalizedData?.ownerOccupied || false

  // No contacts yet - show search prompt
  if (contacts.length === 0) {
    return (
      <div className="space-y-6">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base">Owner Info</CardTitle>
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">{displayOwnerName}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" />
                      <span>{address}, {city}, {state} {zip}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t">
              <h1 className="text-xl font-bold">{displayOwnerName}</h1>
              {displayOwner2Name && (
                <p className="text-sm text-muted-foreground">{displayOwner2Name}</p>
              )}
              {/* Owner flags */}
              {normalizedData && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {isAbsenteeOwner && <Badge variant="secondary" className="text-xs">Absentee Owner</Badge>}
                  {isCorporateOwned && <Badge variant="secondary" className="text-xs">Corporate Owned</Badge>}
                  {isOwnerOccupied && <Badge variant="secondary" className="text-xs">Owner Occupied</Badge>}
                </div>
              )}
              {/* Mailing address from RealEstateAPI */}
              {displayMailingAddress && (
                <div className="flex items-start gap-1.5 mt-2 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{displayMailingAddress}</span>
                </div>
              )}

              {/* Quick stats: bed/bath/sqft, last sale, tax, estimated value */}
              <OwnerQuickStats d={normalizedData} bedrooms={bedrooms} bathrooms={bathrooms} sqft={sqft} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Skip Trace section */}
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
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserSearch className="mr-2 h-4 w-4" />
                  )}
                  {loading ? 'Searching...' : 'Run Skip Trace'}
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

            {/* Fetch Property Data section */}
            {!normalizedData && (
              <div className="text-center space-y-4 py-4 border-t">
                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <Database className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold">Fetch Property Data</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Pull financials, sale history, tax info, and more
                  </p>
                </div>
                <Button
                  onClick={fetchPropertyData}
                  disabled={fetchingPropertyData}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {fetchingPropertyData ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Database className="mr-2 h-4 w-4" />
                  )}
                  {fetchingPropertyData ? 'Fetching...' : 'Fetch Property Data'}
                </Button>
              </div>
            )}
            {normalizedData && !fetchingPropertyData && (
              <div className="pt-2 border-t">
                <Button
                  onClick={fetchPropertyData}
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-xs"
                >
                  <RefreshCw className="mr-1.5 h-3 w-3" />
                  Refresh Property Data
                </Button>
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

          <EmailComposer
            isOpen={emailComposerOpen}
            onClose={() => setEmailComposerOpen(false)}
            initialTo={selectedEmail}
            property={{
              id: propertyId,
              address,
              city,
              state,
              zip,
              price: listPrice || null,
              bedrooms: bedrooms || null,
              bathrooms: bathrooms || null,
              sqft: sqft || null,
              ownerName: contacts[0]?.name || ownerName,
            }}
          />
        </Card>
        {normalizedData && <PropertyDataCards d={normalizedData} />}
      </div>
    )
  }



  // Has contacts - show results
  const contactOwnerName = contacts[0]?.name || displayOwnerName

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle className="text-base">Owner Info</CardTitle>
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{contactOwnerName}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" />
                    <span>{address}, {city}, {state} {zip}</span>
                  </div>
                </div>
              </div>
            </div>
            <Button
              onClick={() => runSkipTrace(true)}
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              disabled={loading}
            >
              <RefreshCw className={`mr-1.5 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          <div className="mt-3 pt-3 border-t">
            <h1 className="text-xl font-bold">{contactOwnerName}</h1>
            {displayOwner2Name && (
              <p className="text-sm text-muted-foreground">{displayOwner2Name}</p>
            )}
            {/* Owner flags from RealEstateAPI data */}
            {normalizedData && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {isAbsenteeOwner && <Badge variant="secondary" className="text-xs">Absentee Owner</Badge>}
                {isCorporateOwned && <Badge variant="secondary" className="text-xs">Corporate Owned</Badge>}
                {isOwnerOccupied && <Badge variant="secondary" className="text-xs">Owner Occupied</Badge>}
              </div>
            )}
            {/* Mailing address from RealEstateAPI (shown if no BatchData mailing address) */}
            {displayMailingAddress && !mailingAddress?.street && (
              <div className="flex items-start gap-1.5 mt-2 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{displayMailingAddress}</span>
              </div>
            )}

            {/* Quick stats: bed/bath/sqft, last sale, tax, estimated value */}
            <OwnerQuickStats d={normalizedData} bedrooms={bedrooms} bathrooms={bathrooms} sqft={sqft} />
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
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6 ml-2" onPointerDown={(e) => e.stopPropagation()}>
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!phone.is_primary && (
                            <DropdownMenuItem onClick={() => handleSetPrimary('phone', phone.value)}>
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
                  <span className="truncate">
                    {selectedEmail || "Select email"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {allEmails.map((email, i) => (
                    <SelectItem key={i} value={email.value}>
                      <div className="flex items-center gap-2">
                        <span>{email.value}</span>
                        {email.is_primary && (
                          <Badge variant="secondary" className="text-xs px-1 py-0">Primary</Badge>
                        )}
                        <Badge variant="outline" className="text-xs px-1 py-0 capitalize">{email.label}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Actions menu for selected email */}
              {selectedEmail && (() => {
                const idx = allEmails.findIndex(e => e.value === selectedEmail)
                const entry = allEmails[idx]
                if (!entry) return null
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!entry.is_primary && (
                        <DropdownMenuItem onClick={() => handleSetPrimary('email', entry.value)}>
                          <Star className="mr-2 h-4 w-4" />
                          Set as Primary
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => openEditModal('email', idx, entry)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openAddModal('email')}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add New
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDelete('email', idx)}
                        className="text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              })()}
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
              <div className="space-y-1">
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={() => setEmailComposerOpen(true)}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Email {selectedEmail}
                </Button>
                {lastEmailed && (
                  <p className="text-[10px] text-center text-muted-foreground">
                    Last emailed: {format(new Date(lastEmailed), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
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

          {/* Fetch Property Data button */}
          {!normalizedData && (
            <div className="pt-2 border-t">
              <Button
                onClick={fetchPropertyData}
                disabled={fetchingPropertyData}
                variant="outline"
                className="w-full"
              >
                {fetchingPropertyData ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Database className="mr-2 h-4 w-4" />
                )}
                {fetchingPropertyData ? 'Fetching Property Data...' : 'Fetch Property Data'}
              </Button>
              <p className="text-[10px] text-center text-muted-foreground mt-1">
                Pull financials, sale history, tax info, and more from RealEstateAPI
              </p>
            </div>
          )}
          {normalizedData && !fetchingPropertyData && (
            <div className="pt-2 border-t">
              <Button
                onClick={fetchPropertyData}
                variant="ghost"
                size="sm"
                className="w-full h-8 text-xs"
              >
                <RefreshCw className="mr-1.5 h-3 w-3" />
                Refresh Property Data
              </Button>
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
      {normalizedData && <PropertyDataCards d={normalizedData} />}
    </div>
  )
}
