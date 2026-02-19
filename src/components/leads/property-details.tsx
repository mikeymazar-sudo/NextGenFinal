'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  ChevronDown,
  Building2,
  DollarSign,
  Landmark,
  TrendingUp,
  AlertTriangle,
  FileText,
  Home,
  MapPin,
  Droplets,
  History,
  Gavel,
  BarChart3,
  BedDouble,
  Bath,
  Ruler,
  Calendar,
  Layers,
} from 'lucide-react'
import {
  normalizePropertyData,
  fmtCurrency,
  fmtDate,
  display,
  type NormalizedPropertyData,
} from '@/lib/property/data-utils'
import type { Property } from '@/types/schema'

// --- Shared UI helpers ---

function DataRow({ label, value, highlight, danger }: {
  label: string
  value: string
  highlight?: boolean
  danger?: boolean
}) {
  if (value === '-') return null
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${highlight ? 'text-green-600 dark:text-green-400' : danger ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  )
}

function FlagBadge({ label, color }: { label: string; color: 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'yellow' | 'orange' | 'zinc' }) {
  const colors = {
    green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
    orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
    zinc: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400',
  }
  return (
    <span className={`px-2.5 py-1 text-xs font-medium rounded-md ${colors[color]}`}>
      {label}
    </span>
  )
}

// --- Stat Pill for the overview header ---
function StatPill({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
      <div className="text-muted-foreground">{icon}</div>
      <div>
        <p className="text-sm font-semibold leading-tight">{value}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    </div>
  )
}

// ============================================================
// PROPERTY HEADER - Address, type, key stats at a glance
// ============================================================
export function PropertyHeader({ property, d }: { property: Property; d: NormalizedPropertyData | null }) {
  const statusColors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    warm: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    reach_out: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    closed: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  }

  const typeLabel = d?.propertyUse || d?.propertyType || property.property_type || null
  const estValue = d?.estimatedValue

  return (
    <Card className="shadow-sm">
      <CardContent className="p-6">
        {/* Top row: address + status */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold leading-tight">{property.address}</h1>
            <p className="text-sm text-muted-foreground">
              {[property.city, property.state, property.zip].filter(Boolean).join(', ')}
            </p>
          </div>
          <Badge className={`${statusColors[property.status] || 'bg-zinc-100 text-zinc-600'} capitalize shrink-0`}>
            {property.status.replace('_', ' ')}
          </Badge>
        </div>

        {/* Tags row */}
        <div className="flex flex-wrap gap-2 mt-3">
          {typeLabel && (
            <span className="text-xs px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-md font-medium">
              {typeLabel}
            </span>
          )}
          {d?.neighborhood && (
            <span className="text-xs px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-md">
              {d.neighborhood}
            </span>
          )}
          {d?.county && (
            <span className="text-xs px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-md">
              {d.county}
            </span>
          )}
          {estValue && Number(estValue) > 0 && (
            <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md font-semibold">
              AVM: {fmtCurrency(estValue)}
            </span>
          )}
        </div>

        {/* Stat pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4">
          {(property.bedrooms || d?.beds) && (
            <StatPill icon={<BedDouble className="h-4 w-4" />} value={property.bedrooms || d?.beds || '-'} label="Beds" />
          )}
          {(property.bathrooms || d?.bathsFull) && (
            <StatPill icon={<Bath className="h-4 w-4" />} value={property.bathrooms || d?.bathsFull || '-'} label="Baths" />
          )}
          {(property.sqft || d?.livingSqft) && (
            <StatPill
              icon={<Ruler className="h-4 w-4" />}
              value={Number(property.sqft || d?.livingSqft || 0).toLocaleString()}
              label="Sqft"
            />
          )}
          {(property.year_built || d?.yearBuilt) && (
            <StatPill icon={<Calendar className="h-4 w-4" />} value={property.year_built || d?.yearBuilt || '-'} label="Built" />
          )}
          {d?.stories && (
            <StatPill icon={<Layers className="h-4 w-4" />} value={d.stories} label="Stories" />
          )}
          {(d?.lotAcres || d?.lotSqft) && (
            <StatPill
              icon={<MapPin className="h-4 w-4" />}
              value={d.lotAcres ? `${d.lotAcres} ac` : `${Number(d.lotSqft).toLocaleString()} sf`}
              label="Lot"
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// WHOLESALE INDICATORS - Key flags for deal evaluation
// ============================================================
export function WholesaleIndicators({ d }: { d: NormalizedPropertyData }) {
  const flags: { label: string; color: 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'yellow' | 'orange' | 'zinc'; active: boolean }[] = [
    { label: 'Owner Occupied', color: 'green', active: !!d.ownerOccupied },
    { label: 'Absentee Owner', color: 'amber', active: !!d.absenteeOwner },
    { label: 'Corporate Owned', color: 'purple', active: !!d.corporateOwned },
    { label: 'Investor Buyer', color: 'blue', active: !!d.investorBuyer },
    { label: 'High Equity', color: 'green', active: !!d.highEquity },
    { label: 'Free & Clear', color: 'green', active: !!d.freeClear },
    { label: 'Inherited', color: 'yellow', active: !!d.inherited },
    { label: 'Vacant', color: 'red', active: !!d.vacant },
    { label: 'Pre-Foreclosure', color: 'red', active: !!d.preForeclosure },
    { label: 'Tax Lien', color: 'red', active: !!d.taxLien },
    { label: 'Bank Owned (REO)', color: 'red', active: !!d.bankOwned },
    { label: 'Deed in Lieu', color: 'orange', active: !!d.deedInLieu },
    { label: 'Cash Buyer', color: 'blue', active: !!d.cashBuyer },
    { label: 'Cash Sale', color: 'blue', active: !!d.cashSale },
    { label: 'Quit Claim', color: 'yellow', active: !!d.quitClaim },
    { label: 'Adjustable Rate', color: 'orange', active: !!d.adjustableRate },
    { label: 'Assumable Loan', color: 'green', active: !!d.assumable },
    { label: 'Mobile Home', color: 'zinc', active: !!d.mobileHome },
  ]

  const activeFlags = flags.filter(f => f.active)

  const hasFlood = d.floodZone
  const hasDelinquent = d.delinquentYear

  if (activeFlags.length === 0 && !hasFlood && !hasDelinquent) return null

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Wholesale Indicators
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-1.5">
          {activeFlags.map((f) => (
            <FlagBadge key={f.label} label={f.label} color={f.color} />
          ))}
          {hasFlood && (
            <FlagBadge
              label={`Flood Zone${d.floodZoneType ? `: ${d.floodZoneType}` : ''}`}
              color={d.floodZoneType === 'X' ? 'zinc' : 'red'}
            />
          )}
          {hasDelinquent && (
            <FlagBadge label={`Tax Delinquent: ${d.delinquentYear}`} color="red" />
          )}
        </div>
        {d.mailingAddress && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground">Mailing Address</p>
            <p className="text-sm font-medium">{d.mailingAddress}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// FINANCIAL OVERVIEW - Equity, mortgage, estimated value
// ============================================================
export function FinancialOverview({ d }: { d: NormalizedPropertyData }) {
  const hasData = d.estimatedEquity || d.estimatedValue || d.mortgageAmount || d.openMortgageBalance || d.estimatedMortgagePayment

  if (!hasData) return null

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-green-600" />
          Financial Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        {/* Big numbers row */}
        <div className="grid grid-cols-2 gap-3 pb-3">
          {d.estimatedValue && Number(d.estimatedValue) > 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-green-600 dark:text-green-400 font-medium">Est. Value</p>
              <p className="text-lg font-bold text-green-700 dark:text-green-300">{fmtCurrency(d.estimatedValue)}</p>
            </div>
          )}
          {d.estimatedEquity && Number(d.estimatedEquity) > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-400 font-medium">
                Est. Equity {d.equityPercent ? `(${d.equityPercent}%)` : ''}
              </p>
              <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{fmtCurrency(d.estimatedEquity)}</p>
            </div>
          )}
        </div>

        <DataRow label="Open Mortgage Balance" value={fmtCurrency(d.openMortgageBalance)} />
        <DataRow label="Est. Mortgage Balance" value={fmtCurrency(d.estimatedMortgageBalance)} />
        {d.estimatedMortgagePayment && Number(d.estimatedMortgagePayment) > 0 && (
          <DataRow label="Est. Monthly Payment" value={`${fmtCurrency(d.estimatedMortgagePayment)}/mo`} />
        )}

        {/* Current mortgage details */}
        {d.mortgageLender && (
          <div className="mt-2 pt-2 border-t space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Current Mortgage</p>
            <DataRow label="Amount" value={fmtCurrency(d.mortgageAmount)} />
            <DataRow label="Lender" value={display(d.mortgageLender)} />
            {d.mortgageLoanType && <DataRow label="Type" value={display(d.mortgageLoanType)} />}
            {d.mortgageRate && Number(d.mortgageRate) > 0 && <DataRow label="Rate" value={`${d.mortgageRate}%`} />}
            {d.mortgageTerm && <DataRow label="Term" value={`${d.mortgageTerm} months`} />}
            {d.mortgageDate && <DataRow label="Date" value={fmtDate(d.mortgageDate)} />}
            {d.mortgageAssumable && <DataRow label="Assumable" value="Yes" highlight />}
          </div>
        )}
        {d.mortgage2Amount && (
          <div className="mt-2 pt-2 border-t space-y-1">
            <p className="text-xs font-medium text-muted-foreground">2nd Mortgage</p>
            <DataRow label="Amount" value={fmtCurrency(d.mortgage2Amount)} />
            <DataRow label="Lender" value={display(d.mortgage2Lender)} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// SALE HISTORY - Collapsible table of sales
// ============================================================
export function SaleHistoryCard({ d }: { d: NormalizedPropertyData }) {
  const [showAll, setShowAll] = useState(false)

  if (!d.saleHistory || d.saleHistory.length === 0) {
    // Still show last sale if available
    if (!d.lastSalePrice && !d.lastSaleDate) return null

    return (
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-indigo-500" />
            Last Sale
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-1">
          <DataRow label="Sale Price" value={fmtCurrency(d.lastSalePrice)} highlight />
          <DataRow label="Date" value={fmtDate(d.lastSaleDate)} />
          {d.lastSaleBuyer && <DataRow label="Buyer" value={display(d.lastSaleBuyer)} />}
          {d.lastSaleSeller && <DataRow label="Seller" value={display(d.lastSaleSeller)} />}
          {d.lastSaleDocType && <DataRow label="Doc Type" value={display(d.lastSaleDocType)} />}
          {d.lastSaleMethod && <DataRow label="Method" value={display(d.lastSaleMethod)} />}
        </CardContent>
      </Card>
    )
  }

  const sales = showAll ? d.saleHistory : d.saleHistory.slice(0, 5)

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <History className="h-4 w-4 text-indigo-500" />
          Sale History ({d.saleHistory.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-0">
          {sales.map((sale: any, i: number) => {
            const amount = Number(sale.saleAmount)
            const isForeclosure = sale.transactionType?.toLowerCase().includes('foreclosure')

            return (
              <div key={i} className={`py-2.5 space-y-1 ${i > 0 ? 'border-t' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {amount > 0 ? fmtCurrency(amount) : '$0'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(sale.saleDate || sale.recordingDate)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sale.documentType && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${isForeclosure ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
                      {sale.documentType}
                    </span>
                  )}
                  {sale.purchaseMethod && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {sale.purchaseMethod}
                    </span>
                  )}
                  {sale.armsLength === false && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                      Non-Arms Length
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {sale.buyerNames && <p>Buyer: <span className="text-foreground">{sale.buyerNames}</span></p>}
                  {sale.sellerNames && <p>Seller: <span className="text-foreground">{sale.sellerNames}</span></p>}
                </div>
              </div>
            )
          })}
        </div>
        {d.saleHistory.length > 5 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showAll ? 'Show less' : `Show all ${d.saleHistory.length} sales`}
          </button>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// MORTGAGE HISTORY
// ============================================================
export function MortgageHistoryCard({ d }: { d: NormalizedPropertyData }) {
  const [showAll, setShowAll] = useState(false)

  if (!d.mortgageHistory || d.mortgageHistory.length === 0) return null

  const mortgages = showAll ? d.mortgageHistory : d.mortgageHistory.slice(0, 5)

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Landmark className="h-4 w-4 text-violet-500" />
          Mortgage History ({d.mortgageHistory.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-0">
          {mortgages.map((mtg: any, i: number) => (
            <div key={i} className={`py-2.5 space-y-1 ${i > 0 ? 'border-t' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{fmtCurrency(mtg.amount)}</span>
                <div className="flex items-center gap-2">
                  {mtg.open && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                      Open
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(mtg.recordingDate || mtg.documentDate)}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {mtg.loanType && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    {mtg.loanType}
                  </span>
                )}
                {mtg.lenderType && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    {mtg.lenderType}
                  </span>
                )}
                {mtg.assumable && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                    Assumable
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                <p>Lender: <span className="text-foreground">{mtg.lenderName || '-'}</span></p>
                {mtg.granteeName && <p>Grantee: <span className="text-foreground">{mtg.granteeName}</span></p>}
                {mtg.term && <p>Term: <span className="text-foreground">{mtg.term} {mtg.termType || 'months'}</span></p>}
              </div>
            </div>
          ))}
        </div>
        {d.mortgageHistory.length > 5 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showAll ? 'Show less' : `Show all ${d.mortgageHistory.length} mortgages`}
          </button>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// FORECLOSURE HISTORY
// ============================================================
export function ForeclosureHistoryCard({ d }: { d: NormalizedPropertyData }) {
  if (!d.foreclosureInfo || d.foreclosureInfo.length === 0) return null

  return (
    <Card className="shadow-sm border-red-200 dark:border-red-800/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
          <Gavel className="h-4 w-4" />
          Foreclosure History ({d.foreclosureInfo.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-0">
          {d.foreclosureInfo.map((fc: any, i: number) => (
            <div key={i} className={`py-2.5 space-y-1 ${i > 0 ? 'border-t' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{fc.documentType || 'Foreclosure Filing'}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${fc.active ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                    {fc.active ? 'Active' : 'Inactive'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(fc.recordingDate)}
                  </span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {fc.caseNumber && <p>Case: <span className="text-foreground">{fc.caseNumber}</span></p>}
                {fc.lenderName && <p>Lender: <span className="text-foreground">{fc.lenderName}</span></p>}
                {fc.originalLoanAmount && <p>Original Loan: <span className="text-foreground">{fmtCurrency(fc.originalLoanAmount)}</span></p>}
                {fc.judgmentAmount && <p>Judgment: <span className="text-foreground">{fmtCurrency(fc.judgmentAmount)}</span></p>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// TAX INFO
// ============================================================
export function TaxInfoCard({ d }: { d: NormalizedPropertyData }) {
  const hasData = d.taxAmount || d.assessedTotal || d.marketTotal

  if (!hasData) return null

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Landmark className="h-4 w-4 text-slate-500" />
          Tax & Assessment
          {d.delinquentYear && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              Delinquent: {d.delinquentYear}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        <DataRow label="Tax Amount" value={fmtCurrency(d.taxAmount)} />
        <DataRow label="Tax Year" value={display(d.taxYear)} />
        {d.taxPerSqft && <DataRow label="Tax/Sqft" value={fmtCurrency(d.taxPerSqft)} />}
        <div className="border-t my-2" />
        <DataRow label="Assessed Total" value={fmtCurrency(d.assessedTotal)} />
        <DataRow label="Assessed Land" value={fmtCurrency(d.assessedLand)} />
        <DataRow label="Assessed Improvement" value={fmtCurrency(d.assessedImprovement)} />
        <div className="border-t my-2" />
        <DataRow label="Market Value" value={fmtCurrency(d.marketTotal)} highlight />
        <DataRow label="Market Land" value={fmtCurrency(d.marketLand)} />
        <DataRow label="Market Improvement" value={fmtCurrency(d.marketImprovement)} />
      </CardContent>
    </Card>
  )
}

// ============================================================
// BUILDING DETAILS
// ============================================================
export function BuildingDetailsCard({ d }: { d: NormalizedPropertyData }) {
  const hasData = d.condition || d.constructionType || d.wallType || d.coolingType || d.heatingType ||
    d.garageType || d.pool || d.fireplace || d.basementType || d.airConditioning

  if (!hasData) return null

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Building2 className="h-4 w-4 text-teal-500" />
          Building Details
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        <DataRow label="Condition" value={display(d.condition)} />
        {d.constructionType && <DataRow label="Construction" value={display(d.constructionType)} />}
        {d.wallType && <DataRow label="Interior" value={display(d.wallType)} />}
        {d.airConditioning && <DataRow label="A/C" value={display(d.airConditioning)} />}
        {d.heatingType && <DataRow label="Heating" value={display(d.heatingType)} />}
        {d.heatingFuelType && <DataRow label="Fuel" value={display(d.heatingFuelType)} />}
        {d.garageType && <DataRow label="Garage" value={display(d.garageType)} />}
        {d.garageSqft && Number(d.garageSqft) > 0 && <DataRow label="Garage Sqft" value={display(d.garageSqft)} />}
        {d.basementType && d.basementType !== 'NO BASEMENT' && <DataRow label="Basement" value={display(d.basementType)} />}
        {d.basementSqft && Number(d.basementSqft) > 0 && <DataRow label="Basement Sqft" value={display(d.basementSqft)} />}
        {d.parkingSpaces && Number(d.parkingSpaces) > 0 && <DataRow label="Parking Spaces" value={display(d.parkingSpaces)} />}
        {d.pool && <DataRow label="Pool" value="Yes" />}
        {d.fireplace && <DataRow label="Fireplace" value={d.fireplaces ? `Yes (${d.fireplaces})` : 'Yes'} />}
        {d.grossSqft && Number(d.grossSqft) > 0 && <DataRow label="Building Sqft" value={display(d.grossSqft)} />}
        {d.unitsCount && Number(d.unitsCount) > 0 && <DataRow label="Units" value={display(d.unitsCount)} />}
      </CardContent>
    </Card>
  )
}

// ============================================================
// LOT & LEGAL
// ============================================================
export function LotLegalCard({ d }: { d: NormalizedPropertyData }) {
  const hasData = d.apn || d.zoningType || d.subdivision || d.legalDescription || d.landUse

  if (!hasData) return null

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-amber-600" />
          Lot & Legal
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        {d.apn && <DataRow label="APN" value={display(d.apn)} />}
        {d.zoningType && <DataRow label="Zoning" value={display(d.zoningType)} />}
        {d.subdivision && <DataRow label="Subdivision" value={display(d.subdivision)} />}
        {d.landUse && <DataRow label="Land Use" value={display(d.landUse)} />}
        {d.propertyClass && <DataRow label="Property Class" value={display(d.propertyClass)} />}
        {d.lotSqft && Number(d.lotSqft) > 0 && <DataRow label="Lot Sqft" value={`${Number(d.lotSqft).toLocaleString()}`} />}
        {d.lotAcres && <DataRow label="Lot Acres" value={`${d.lotAcres} ac`} />}
        {d.lotNum && <DataRow label="Lot #" value={display(d.lotNum)} />}
        {d.lotDepthFeet && <DataRow label="Lot Depth" value={`${d.lotDepthFeet} ft`} />}
        {d.lotWidthFeet && <DataRow label="Lot Width" value={`${d.lotWidthFeet} ft`} />}
        {d.censusTract && <DataRow label="Census Tract" value={display(d.censusTract)} />}
        {d.fips && <DataRow label="FIPS" value={display(d.fips)} />}
        {d.legalDescription && (
          <div className="pt-2 border-t mt-2">
            <p className="text-xs text-muted-foreground mb-1">Legal Description</p>
            <p className="text-xs font-medium text-foreground break-words">{d.legalDescription}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// DEMOGRAPHICS / FMR
// ============================================================
export function DemographicsCard({ d }: { d: NormalizedPropertyData }) {
  const hasFmr = d.fmrOneBedroom || d.fmrTwoBedroom || d.fmrThreeBedroom
  const hasDemo = d.medianIncome || d.suggestedRent || hasFmr

  if (!hasDemo) return null

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-cyan-500" />
          Demographics & Market Rents
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        {d.medianIncome && <DataRow label="Median Income" value={fmtCurrency(d.medianIncome)} />}
        {d.suggestedRent && <DataRow label="Suggested Rent" value={fmtCurrency(d.suggestedRent)} highlight />}
        {d.hudAreaName && <DataRow label="HUD Area" value={display(d.hudAreaName)} />}
        {hasFmr && (
          <div className="pt-2 border-t mt-2">
            <p className="text-xs font-medium text-muted-foreground mb-2">Fair Market Rents</p>
            <div className="grid grid-cols-2 gap-x-4">
              {d.fmrEfficiency && <DataRow label="Efficiency" value={fmtCurrency(d.fmrEfficiency)} />}
              {d.fmrOneBedroom && <DataRow label="1 Bedroom" value={fmtCurrency(d.fmrOneBedroom)} />}
              {d.fmrTwoBedroom && <DataRow label="2 Bedroom" value={fmtCurrency(d.fmrTwoBedroom)} />}
              {d.fmrThreeBedroom && <DataRow label="3 Bedroom" value={fmtCurrency(d.fmrThreeBedroom)} />}
              {d.fmrFourBedroom && <DataRow label="4 Bedroom" value={fmtCurrency(d.fmrFourBedroom)} />}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// MASTER COMPONENT - Renders all property detail cards
// ============================================================
export function PropertyDetails({ property }: { property: Property }) {
  const rawData = property.raw_realestate_data
  const d = rawData ? normalizePropertyData(rawData) : null

  return (
    <div className="space-y-4">
      {/* Property Header - always shows */}
      <PropertyHeader property={property} d={d} />

      {d && (
        <>
          {/* Wholesale Indicators */}
          <WholesaleIndicators d={d} />

          {/* Financial Overview */}
          <FinancialOverview d={d} />

          {/* Foreclosure History (if any) */}
          <ForeclosureHistoryCard d={d} />

          {/* Sale History */}
          <SaleHistoryCard d={d} />

          {/* Mortgage History */}
          <MortgageHistoryCard d={d} />

          {/* Tax Info */}
          <TaxInfoCard d={d} />

          {/* Building Details */}
          <BuildingDetailsCard d={d} />

          {/* Lot & Legal */}
          <LotLegalCard d={d} />

          {/* Demographics */}
          <DemographicsCard d={d} />
        </>
      )}
    </div>
  )
}
