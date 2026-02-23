'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Calculator,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Save,
  FolderOpen,
  Trash2,
} from 'lucide-react'
import {
  calculateFullCashFlow,
  getDefaultInputs,
  type CashFlowInputs,
  type CashFlowResults,
} from '@/lib/calculators/cash-flow'
import { toast } from 'sonner'

interface CashFlowCalculatorProps {
  purchasePrice: number
  monthlyRent: number
  repairEstimate: number
  propertyId: string
  existingScenarios?: Array<{ name: string; inputs: CashFlowInputs }>
  onSaveScenarios?: (scenarios: Array<{ name: string; inputs: CashFlowInputs }>) => void
  settings?: {
    vacancyRate?: number
    managementFee?: number
    maintenanceReserve?: number
    capexReserve?: number
    insuranceAnnual?: number
    downPaymentPercent?: number
    interestRate?: number
    loanTermYears?: number
    closingCostsPercent?: number
  }
}

function CalcSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  prefix = '',
  suffix = '',
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  prefix?: string
  suffix?: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px]">{label}</Label>
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] text-muted-foreground">{prefix}</span>
          <Input
            type="number"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-6 w-16 text-right text-[11px] px-1"
            min={min}
            max={max}
            step={step}
          />
          <span className="text-[10px] text-muted-foreground">{suffix}</span>
        </div>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
      />
    </div>
  )
}

function ResultRow({
  label,
  value,
  highlight = false,
  positive,
}: {
  label: string
  value: string
  highlight?: boolean
  positive?: boolean
}) {
  return (
    <div
      className={`flex justify-between text-sm py-0.5 ${
        highlight ? 'font-bold' : ''
      }`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          highlight
            ? positive
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
            : ''
        }
      >
        {value}
      </span>
    </div>
  )
}

export function CashFlowCalculator({
  purchasePrice,
  monthlyRent,
  repairEstimate,
  propertyId,
  existingScenarios = [],
  onSaveScenarios,
  settings,
}: CashFlowCalculatorProps) {
  const [inputs, setInputs] = useState<CashFlowInputs>(
    getDefaultInputs(purchasePrice, monthlyRent, repairEstimate, {
      vacancyRate: settings?.vacancyRate,
      managementFee: settings?.managementFee,
      maintenanceReserve: settings?.maintenanceReserve,
      capexReserve: settings?.capexReserve,
      insuranceAnnual: settings?.insuranceAnnual,
      downPaymentPercent: settings?.downPaymentPercent,
      interestRate: settings?.interestRate,
      loanTermYears: settings?.loanTermYears,
      closingCostsPercent: settings?.closingCostsPercent,
    })
  )

  const [scenarios, setScenarios] = useState(existingScenarios)
  const [scenarioName, setScenarioName] = useState('')

  // Recalculate on any input change
  const results: CashFlowResults = useMemo(
    () => calculateFullCashFlow(inputs),
    [inputs]
  )

  const update = (key: keyof CashFlowInputs, value: number) => {
    setInputs((prev) => ({ ...prev, [key]: value }))
  }

  const saveScenario = () => {
    const name = scenarioName.trim() || `Scenario ${scenarios.length + 1}`
    const newScenarios = [...scenarios, { name, inputs: { ...inputs } }]
    setScenarios(newScenarios)
    setScenarioName('')
    onSaveScenarios?.(newScenarios)
    toast.success(`Saved "${name}"`)
  }

  const loadScenario = (index: number) => {
    setInputs({ ...scenarios[index].inputs })
    toast.info(`Loaded "${scenarios[index].name}"`)
  }

  const deleteScenario = (index: number) => {
    const newScenarios = scenarios.filter((_, i) => i !== index)
    setScenarios(newScenarios)
    onSaveScenarios?.(newScenarios)
  }

  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`
  const fmtPct = (n: number) => `${n.toFixed(1)}%`

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs">
          <Calculator className="mr-1.5 h-3 w-3" />
          Calculator
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Cash Flow Calculator
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {/* === INPUTS === */}

          {/* Property */}
          <div>
            <h4 className="text-xs font-semibold mb-2 text-purple-600">Property</h4>
            <div className="space-y-2">
              <CalcSlider
                label="Purchase Price"
                value={inputs.purchasePrice}
                onChange={(v) => update('purchasePrice', v)}
                min={10000}
                max={2000000}
                step={5000}
                prefix="$"
              />
              <CalcSlider
                label="Monthly Rent"
                value={inputs.monthlyRent}
                onChange={(v) => update('monthlyRent', v)}
                min={200}
                max={10000}
                step={50}
                prefix="$"
              />
              <CalcSlider
                label="Repair Costs"
                value={inputs.repairCosts}
                onChange={(v) => update('repairCosts', v)}
                min={0}
                max={200000}
                step={1000}
                prefix="$"
              />
              <CalcSlider
                label="Annual Taxes"
                value={inputs.taxesAnnual}
                onChange={(v) => update('taxesAnnual', v)}
                min={0}
                max={20000}
                step={100}
                prefix="$"
              />
            </div>
          </div>

          <Separator />

          {/* Operating Expenses */}
          <div>
            <h4 className="text-xs font-semibold mb-2 text-green-600">Operating Expenses</h4>
            <div className="space-y-2">
              <CalcSlider label="Vacancy" value={inputs.vacancyRate} onChange={(v) => update('vacancyRate', v)} min={0} max={20} step={1} suffix="%" />
              <CalcSlider label="Management" value={inputs.managementFee} onChange={(v) => update('managementFee', v)} min={0} max={15} step={1} suffix="%" />
              <CalcSlider label="Maintenance" value={inputs.maintenanceReserve} onChange={(v) => update('maintenanceReserve', v)} min={0} max={15} step={1} suffix="%" />
              <CalcSlider label="CapEx" value={inputs.capexReserve} onChange={(v) => update('capexReserve', v)} min={0} max={10} step={1} suffix="%" />
              <CalcSlider label="Insurance/yr" value={inputs.insuranceAnnual} onChange={(v) => update('insuranceAnnual', v)} min={600} max={5000} step={100} prefix="$" />
            </div>
          </div>

          <Separator />

          {/* Financing */}
          <div>
            <h4 className="text-xs font-semibold mb-2 text-blue-600">Financing</h4>
            <div className="space-y-2">
              <CalcSlider label="Down Payment" value={inputs.downPaymentPercent} onChange={(v) => update('downPaymentPercent', v)} min={0} max={100} step={5} suffix="%" />
              <CalcSlider label="Interest Rate" value={inputs.interestRate} onChange={(v) => update('interestRate', v)} min={3} max={15} step={0.25} suffix="%" />
              <CalcSlider label="Loan Term" value={inputs.loanTermYears} onChange={(v) => update('loanTermYears', v)} min={15} max={30} step={5} suffix="yr" />
              <CalcSlider label="Closing Costs" value={inputs.closingCostsPercent} onChange={(v) => update('closingCostsPercent', v)} min={1} max={6} step={0.5} suffix="%" />
            </div>
          </div>

          <Separator />

          {/* === RESULTS === */}
          <div>
            <h4 className="text-xs font-semibold mb-2 text-amber-600">Results</h4>

            {/* Key Metrics */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="text-center p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                <p className="text-[9px] text-muted-foreground">Monthly CF</p>
                <p className={`text-sm font-bold ${results.monthlyCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fmt(results.monthlyCashFlow)}
                </p>
              </div>
              <div className="text-center p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                <p className="text-[9px] text-muted-foreground">Cap Rate</p>
                <p className="text-sm font-bold">{fmtPct(results.capRate)}</p>
              </div>
              <div className="text-center p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                <p className="text-[9px] text-muted-foreground">CoC Return</p>
                <p className={`text-sm font-bold ${results.cashOnCash >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fmtPct(results.cashOnCash)}
                </p>
              </div>
              <div className="text-center p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                <p className="text-[9px] text-muted-foreground">DSCR</p>
                <p className={`text-sm font-bold ${results.dscr >= 1.2 ? 'text-green-600' : results.dscr >= 1 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {results.dscr.toFixed(2)}x
                </p>
              </div>
              <div className="text-center p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                <p className="text-[9px] text-muted-foreground">GRM</p>
                <p className="text-sm font-bold">{results.grm.toFixed(1)}</p>
              </div>
              <div className="text-center p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                <p className="text-[9px] text-muted-foreground">Total ROI Yr1</p>
                <p className={`text-sm font-bold ${results.totalROIYear1 >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fmtPct(results.totalROIYear1)}
                </p>
              </div>
            </div>

            {/* Income Breakdown */}
            <div className="space-y-0.5 text-xs">
              <p className="font-medium text-[11px] mb-1">Income</p>
              <ResultRow label="Gross Monthly Rent" value={fmt(results.grossMonthlyIncome)} />
              <ResultRow label="Vacancy Loss" value={`-${fmt(results.vacancyLossMonthly)}`} />
              <ResultRow label="Effective Income" value={fmt(results.effectiveMonthlyIncome)} />
            </div>

            <Separator className="my-2" />

            {/* Expenses Breakdown */}
            <div className="space-y-0.5 text-xs">
              <p className="font-medium text-[11px] mb-1">Monthly Expenses</p>
              <ResultRow label="Management" value={fmt(results.managementFeeMonthly)} />
              <ResultRow label="Maintenance" value={fmt(results.maintenanceMonthly)} />
              <ResultRow label="CapEx Reserve" value={fmt(results.capexMonthly)} />
              <ResultRow label="Insurance" value={fmt(results.insuranceMonthly)} />
              <ResultRow label="Taxes" value={fmt(results.taxesMonthly)} />
              <ResultRow label="Total OpEx" value={fmt(results.totalOperatingExpensesMonthly)} highlight />
            </div>

            <Separator className="my-2" />

            {/* Financing Breakdown */}
            <div className="space-y-0.5 text-xs">
              <p className="font-medium text-[11px] mb-1">Financing</p>
              <ResultRow label="Down Payment" value={fmt(results.downPayment)} />
              <ResultRow label="Loan Amount" value={fmt(results.loanAmount)} />
              <ResultRow label="Closing Costs" value={fmt(results.closingCosts)} />
              <ResultRow label="Total Cash In" value={fmt(results.totalCashInvested)} highlight />
              <ResultRow label="Monthly P&I" value={fmt(results.monthlyMortgagePayment)} />
            </div>

            <Separator className="my-2" />

            {/* Bottom Line */}
            <div className="space-y-0.5 text-xs">
              <p className="font-medium text-[11px] mb-1">Bottom Line</p>
              <ResultRow label="NOI (Annual)" value={fmt(results.noi)} />
              <ResultRow
                label="Monthly Cash Flow"
                value={fmt(results.monthlyCashFlow)}
                highlight
                positive={results.monthlyCashFlow >= 0}
              />
              <ResultRow
                label="Annual Cash Flow"
                value={fmt(results.annualCashFlow)}
                highlight
                positive={results.annualCashFlow >= 0}
              />
              <ResultRow label="Year 1 Principal Paydown" value={fmt(results.year1PrincipalPaydown)} />
            </div>
          </div>

          <Separator />

          {/* Scenarios */}
          <div>
            <h4 className="text-xs font-semibold mb-2">Saved Scenarios</h4>
            <div className="flex gap-2 mb-2">
              <Input
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                placeholder="Scenario name..."
                className="h-7 text-xs"
              />
              <Button size="sm" variant="outline" onClick={saveScenario} className="h-7 text-xs px-2">
                <Save className="h-3 w-3 mr-1" />
                Save
              </Button>
            </div>
            {scenarios.length > 0 ? (
              <div className="space-y-1">
                {scenarios.map((scenario, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800 rounded p-2"
                  >
                    <button
                      className="text-xs text-left hover:text-purple-600 transition-colors flex items-center gap-1"
                      onClick={() => loadScenario(i)}
                    >
                      <FolderOpen className="h-3 w-3" />
                      {scenario.name}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => deleteScenario(i)}
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground">No saved scenarios yet.</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
