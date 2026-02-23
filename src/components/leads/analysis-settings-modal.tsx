'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Settings, Save, Zap } from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import type { AnalysisSettings } from '@/types/schema'
import { DEFAULT_ANALYSIS_SETTINGS } from '@/types/schema'

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApplyOverrides: (overrides: Partial<AnalysisSettings>) => void
}

interface SettingFieldProps {
  label: string
  value: number
  onChange: (val: number) => void
  min: number
  max: number
  step: number
  suffix?: string
  prefix?: string
}

function SettingField({ label, value, onChange, min, max, step, suffix = '', prefix = '' }: SettingFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">{prefix}</span>
          <Input
            type="number"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-7 w-20 text-right text-sm"
            min={min}
            max={max}
            step={step}
          />
          <span className="text-xs text-muted-foreground">{suffix}</span>
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

export function AnalysisSettingsModal({ open, onOpenChange, onApplyOverrides }: SettingsModalProps) {
  const [settings, setSettings] = useState<AnalysisSettings>(DEFAULT_ANALYSIS_SETTINGS)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      api.getAnalysisSettings().then((res) => {
        if (res.data) setSettings(res.data)
      })
    }
  }, [open])

  const update = (key: keyof AnalysisSettings, value: number) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const saveAsDefaults = async () => {
    setLoading(true)
    const res = await api.updateAnalysisSettings(settings)
    setLoading(false)
    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success('Default settings saved!')
    }
  }

  const applyToDeal = () => {
    onApplyOverrides(settings)
    onOpenChange(false)
    toast.success('Settings applied to this deal')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Analysis Assumptions
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Wholesale Settings */}
          <div>
            <h4 className="text-sm font-semibold mb-3 text-purple-600">Wholesale</h4>
            <div className="space-y-4">
              <SettingField label="MAO Rule" value={settings.mao_percentage} onChange={(v) => update('mao_percentage', v)} min={50} max={85} step={1} suffix="%" />
              <SettingField label="Repair Buffer" value={settings.repair_buffer_percentage} onChange={(v) => update('repair_buffer_percentage', v)} min={0} max={30} step={1} suffix="%" />
              <SettingField label="Holding Period" value={settings.holding_months} onChange={(v) => update('holding_months', v)} min={1} max={12} step={1} suffix="mo" />
              <SettingField label="Holding Cost" value={settings.holding_cost_monthly} onChange={(v) => update('holding_cost_monthly', v)} min={500} max={5000} step={100} prefix="$" suffix="/mo" />
              <SettingField label="Assignment Fee Target" value={settings.assignment_fee_target} onChange={(v) => update('assignment_fee_target', v)} min={5000} max={50000} step={1000} prefix="$" />
            </div>
          </div>

          <Separator />

          {/* Rental Assumptions */}
          <div>
            <h4 className="text-sm font-semibold mb-3 text-green-600">Rental Analysis</h4>
            <div className="space-y-4">
              <SettingField label="Vacancy Rate" value={settings.vacancy_rate} onChange={(v) => update('vacancy_rate', v)} min={0} max={20} step={1} suffix="%" />
              <SettingField label="Management Fee" value={settings.management_fee} onChange={(v) => update('management_fee', v)} min={0} max={15} step={1} suffix="%" />
              <SettingField label="Maintenance Reserve" value={settings.maintenance_reserve} onChange={(v) => update('maintenance_reserve', v)} min={0} max={15} step={1} suffix="%" />
              <SettingField label="CapEx Reserve" value={settings.capex_reserve} onChange={(v) => update('capex_reserve', v)} min={0} max={10} step={1} suffix="%" />
              <SettingField label="Insurance (Annual)" value={settings.insurance_annual} onChange={(v) => update('insurance_annual', v)} min={600} max={5000} step={100} prefix="$" />
            </div>
          </div>

          <Separator />

          {/* Financing */}
          <div>
            <h4 className="text-sm font-semibold mb-3 text-blue-600">Financing</h4>
            <div className="space-y-4">
              <SettingField label="Down Payment" value={settings.down_payment_percentage} onChange={(v) => update('down_payment_percentage', v)} min={0} max={100} step={5} suffix="%" />
              <SettingField label="Interest Rate" value={settings.interest_rate} onChange={(v) => update('interest_rate', v)} min={3} max={15} step={0.25} suffix="%" />
              <SettingField label="Loan Term" value={settings.loan_term_years} onChange={(v) => update('loan_term_years', v)} min={15} max={30} step={5} suffix="yr" />
              <SettingField label="Closing Costs" value={settings.closing_costs_percentage} onChange={(v) => update('closing_costs_percentage', v)} min={1} max={6} step={0.5} suffix="%" />
            </div>
          </div>

          <Separator />

          {/* Targets */}
          <div>
            <h4 className="text-sm font-semibold mb-3 text-amber-600">Target Returns</h4>
            <div className="space-y-4">
              <SettingField label="Target Cap Rate" value={settings.target_cap_rate} onChange={(v) => update('target_cap_rate', v)} min={4} max={15} step={0.5} suffix="%" />
              <SettingField label="Target Cash-on-Cash" value={settings.target_cash_on_cash} onChange={(v) => update('target_cash_on_cash', v)} min={5} max={25} step={1} suffix="%" />
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={saveAsDefaults} variant="outline" className="flex-1" disabled={loading}>
            <Save className="mr-2 h-4 w-4" />
            {loading ? 'Saving...' : 'Save as My Defaults'}
          </Button>
          <Button onClick={applyToDeal} className="flex-1">
            <Zap className="mr-2 h-4 w-4" />
            Apply to This Deal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
