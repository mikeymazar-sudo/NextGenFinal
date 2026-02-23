'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Brain,
  RefreshCw,
  AlertTriangle,
  Settings,
  Zap,
  TrendingUp,
  DollarSign,
  MessageSquare,
  Phone,
  Camera,
  BarChart3,
  Target,
  Shield,
  Lightbulb,
  Unlock,
} from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import { AnalysisSettingsModal } from './analysis-settings-modal'
import { DataCompleteness } from './data-completeness'
import { CashFlowCalculator } from './cash-flow-calculator'
import { useFullAnalysis } from '@/hooks/use-full-analysis'
import type { Property, DealAnalysis, AnalysisSettings } from '@/types/schema'

const gradeColors: Record<string, string> = {
  A: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  B: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400',
  C: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  D: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  F: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const confidenceColors: Record<string, string> = {
  high: 'text-green-600 dark:text-green-400',
  medium: 'text-yellow-600 dark:text-yellow-400',
  low: 'text-red-600 dark:text-red-400',
}

interface DealAnalysisProps {
  propertyId: string
  property: Property
  existingAnalysis: DealAnalysis | null
  analyzedAt: string | null
  hasRentalData: boolean
  hasSoldData: boolean
  photoCount: number
  transcriptCount: number
  messageCount: number
  onPropertyUpdate: (updates: Partial<Property>) => void
}

function DataSourceBadges({ sources }: { sources: string[] }) {
  const iconMap: Record<string, React.ReactNode> = {
    property_data: <BarChart3 className="h-3 w-3" />,
    sold_comps: <TrendingUp className="h-3 w-3" />,
    rental_comps: <DollarSign className="h-3 w-3" />,
    call_transcripts: <Phone className="h-3 w-3" />,
    sms_messages: <MessageSquare className="h-3 w-3" />,
    user_notes: <Lightbulb className="h-3 w-3" />,
    subject_photos: <Camera className="h-3 w-3" />,
    comp_images: <Camera className="h-3 w-3" />,
  }

  const labelMap: Record<string, string> = {
    property_data: 'Property Data',
    sold_comps: 'Sold Comps',
    rental_comps: 'Rental Comps',
    call_transcripts: 'Transcripts',
    sms_messages: 'SMS',
    user_notes: 'Notes',
    subject_photos: 'Photos',
    comp_images: 'Comp Images',
  }

  return (
    <div className="flex flex-wrap gap-1">
      {sources.map((source) => (
        <Badge
          key={source}
          variant="secondary"
          className="text-[10px] px-1.5 py-0 h-5 gap-1 font-normal"
        >
          {iconMap[source] || null}
          {labelMap[source] || source}
        </Badge>
      ))}
    </div>
  )
}

function MetricBox({
  label,
  value,
  subtext,
  className = '',
}: {
  label: string
  value: string
  subtext?: string
  className?: string
}) {
  return (
    <div className={`bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3 ${className}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
      {subtext && <p className="text-[10px] text-muted-foreground mt-0.5">{subtext}</p>}
    </div>
  )
}

export function DealAnalysisCard({
  propertyId,
  property,
  existingAnalysis,
  analyzedAt,
  hasRentalData,
  hasSoldData,
  photoCount,
  transcriptCount,
  messageCount,
  onPropertyUpdate,
}: DealAnalysisProps) {
  const [analysis, setAnalysis] = useState<DealAnalysis | null>(existingAnalysis)
  const [loading, setLoading] = useState(false)
  const [cached, setCached] = useState(!!existingAnalysis)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [overrides, setOverrides] = useState<Partial<AnalysisSettings> | undefined>()

  const {
    running: unlockRunning,
    steps,
    progress,
    runFullAnalysis,
  } = useFullAnalysis({
    propertyId,
    property,
    overrides,
    onAnalysisComplete: (result) => {
      setAnalysis(result)
      setCached(false)
    },
    onPropertyUpdate,
  })

  const runAnalysis = async (force?: boolean) => {
    setLoading(true)
    const result = await api.analyzeProperty(propertyId, overrides, force)
    setLoading(false)

    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      setAnalysis(result.data)
      setCached(result.cached || false)
      toast.success(result.cached ? 'Loaded cached analysis' : 'Analysis complete!')
    }
  }

  const handleApplyOverrides = (newOverrides: Partial<AnalysisSettings>) => {
    setOverrides(newOverrides)
    toast.info('Settings applied. Click Analyze to use them.')
  }

  const fmt = (n: number | undefined) =>
    n !== undefined ? `$${n.toLocaleString()}` : '—'

  const fmtPct = (n: number | undefined) =>
    n !== undefined ? `${n.toFixed(1)}%` : '—'

  const isLoading = loading || unlockRunning

  // Loading state
  if (loading && !unlockRunning) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-600 animate-pulse" />
            AI Deal Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-purple-600 animate-pulse" />
            <p className="text-sm text-muted-foreground animate-pulse">
              Analyzing deal with all available data...
            </p>
          </div>
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    )
  }

  // No analysis yet (or running unlock all)
  if (!analysis || unlockRunning) {
    return (
      <>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-600" />
              AI Deal Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Data Completeness */}
            <DataCompleteness
              property={property}
              photoCount={photoCount}
              transcriptCount={transcriptCount}
              messageCount={messageCount}
              running={unlockRunning}
              steps={steps}
              progress={progress}
              onUnlockAll={runFullAnalysis}
            />

            {!unlockRunning && (
              <>
                {overrides && (
                  <Badge variant="outline" className="text-[10px]">
                    Custom settings applied
                  </Badge>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={runFullAnalysis}
                    className="flex-1"
                    disabled={isLoading}
                  >
                    <Unlock className="mr-2 h-4 w-4" />
                    Unlock All & Analyze
                  </Button>
                  <Button
                    onClick={() => runAnalysis()}
                    variant="outline"
                    className="flex-1"
                    disabled={isLoading}
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    Quick Analyze
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings className="mr-1.5 h-3 w-3" />
                  Analysis Settings
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <AnalysisSettingsModal
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onApplyOverrides={handleApplyOverrides}
        />
      </>
    )
  }

  // Analysis results
  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-600" />
            AI Deal Analysis
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge className={gradeColors[analysis.deal_grade] || 'bg-zinc-100'}>
              {analysis.deal_grade}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setSettingsOpen(true)}
              title="Settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => runAnalysis(true)}
              title="Re-analyze (force fresh)"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Metadata row */}
          <div className="flex items-center justify-between">
            {cached && analyzedAt && (
              <p className="text-[10px] text-muted-foreground">
                {new Date(analyzedAt).toLocaleDateString()}
              </p>
            )}
            <Badge
              variant="outline"
              className={`text-[10px] ${confidenceColors[analysis.confidence] || ''}`}
            >
              {analysis.confidence} confidence
            </Badge>
          </div>

          {/* Data Sources */}
          {analysis.data_sources_used && analysis.data_sources_used.length > 0 && (
            <DataSourceBadges sources={analysis.data_sources_used} />
          )}

          {/* Core metrics */}
          <div className="grid grid-cols-2 gap-2">
            <MetricBox label="ARV" value={fmt(analysis.arv)} />
            <MetricBox
              label={`MAO (${analysis.assumptions_used?.mao_percentage || 70}%)`}
              value={fmt(analysis.max_allowable_offer)}
            />
            <MetricBox label="Repair Estimate" value={fmt(analysis.repair_estimate)} />
            {analysis.estimated_profit !== undefined && (
              <MetricBox
                label="Est. Profit"
                value={fmt(analysis.estimated_profit)}
                className={
                  analysis.estimated_profit > 0
                    ? 'bg-green-50 dark:bg-green-900/20'
                    : 'bg-red-50 dark:bg-red-900/20'
                }
              />
            )}
          </div>

          {/* Holding costs & assignment fee */}
          {(analysis.holding_costs || analysis.assignment_fee) && (
            <div className="grid grid-cols-2 gap-2">
              {analysis.holding_costs !== undefined && (
                <MetricBox label="Holding Costs" value={fmt(analysis.holding_costs)} />
              )}
              {analysis.assignment_fee !== undefined && (
                <MetricBox label="Assignment Fee" value={fmt(analysis.assignment_fee)} />
              )}
            </div>
          )}

          {/* Rental ARV */}
          {analysis.rental_arv && (
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Rental ARV</p>
              <p className="text-lg font-bold">${analysis.rental_arv.toLocaleString()}</p>
              {analysis.rental_arv_reasoning && (
                <p className="text-xs text-muted-foreground mt-1">
                  {analysis.rental_arv_reasoning}
                </p>
              )}
            </div>
          )}

          <Separator />

          {/* Cash Flow Metrics */}
          {(analysis.cap_rate || analysis.cash_on_cash || analysis.monthly_cash_flow) && (
            <>
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                  Cash Flow Metrics
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {analysis.cap_rate !== undefined && (
                    <div className="text-center p-2 bg-zinc-50 dark:bg-zinc-800 rounded">
                      <p className="text-[10px] text-muted-foreground">Cap Rate</p>
                      <p className="text-sm font-bold">{fmtPct(analysis.cap_rate)}</p>
                    </div>
                  )}
                  {analysis.cash_on_cash !== undefined && (
                    <div className="text-center p-2 bg-zinc-50 dark:bg-zinc-800 rounded">
                      <p className="text-[10px] text-muted-foreground">CoC Return</p>
                      <p className="text-sm font-bold">{fmtPct(analysis.cash_on_cash)}</p>
                    </div>
                  )}
                  {analysis.monthly_cash_flow !== undefined && (
                    <div className="text-center p-2 bg-zinc-50 dark:bg-zinc-800 rounded">
                      <p className="text-[10px] text-muted-foreground">Monthly CF</p>
                      <p className="text-sm font-bold">{fmt(analysis.monthly_cash_flow)}</p>
                    </div>
                  )}
                  {analysis.dscr !== undefined && (
                    <div className="text-center p-2 bg-zinc-50 dark:bg-zinc-800 rounded">
                      <p className="text-[10px] text-muted-foreground">DSCR</p>
                      <p className="text-sm font-bold">{analysis.dscr.toFixed(2)}x</p>
                    </div>
                  )}
                  {analysis.grm !== undefined && (
                    <div className="text-center p-2 bg-zinc-50 dark:bg-zinc-800 rounded">
                      <p className="text-[10px] text-muted-foreground">GRM</p>
                      <p className="text-sm font-bold">{analysis.grm.toFixed(1)}</p>
                    </div>
                  )}
                  {analysis.noi !== undefined && (
                    <div className="text-center p-2 bg-zinc-50 dark:bg-zinc-800 rounded">
                      <p className="text-[10px] text-muted-foreground">NOI</p>
                      <p className="text-sm font-bold">{fmt(analysis.noi)}</p>
                    </div>
                  )}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Repair Breakdown */}
          {analysis.repair_breakdown &&
            Object.keys(analysis.repair_breakdown).length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Repair Breakdown</p>
                <div className="space-y-1">
                  {Object.entries(analysis.repair_breakdown).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-muted-foreground capitalize">
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span className="font-medium">${value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Seller Motivation */}
          {analysis.seller_motivation_signals &&
            analysis.seller_motivation_signals.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1">
                  <Target className="h-3.5 w-3.5 text-purple-500" />
                  Seller Motivation Signals
                </p>
                <ul className="space-y-1">
                  {analysis.seller_motivation_signals.map((signal, i) => (
                    <li
                      key={i}
                      className="text-sm text-muted-foreground flex items-start gap-2"
                    >
                      <span className="text-purple-500 mt-1">&#x2022;</span>
                      {signal}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Negotiation Insights */}
          {analysis.negotiation_insights &&
            analysis.negotiation_insights.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5 text-blue-500" />
                  Negotiation Insights
                </p>
                <ul className="space-y-1">
                  {analysis.negotiation_insights.map((insight, i) => (
                    <li
                      key={i}
                      className="text-sm text-muted-foreground flex items-start gap-2"
                    >
                      <span className="text-blue-500 mt-1">&#x2022;</span>
                      {insight}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Risk Factors */}
          {analysis.risk_factors.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Risk Factors
              </p>
              <ul className="space-y-1">
                {analysis.risk_factors.map((risk, i) => (
                  <li
                    key={i}
                    className="text-sm text-muted-foreground flex items-start gap-2"
                  >
                    <span className="text-amber-500 mt-1">&#x2022;</span>
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ARV Reasoning */}
          {analysis.arv_reasoning && (
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">
              <p className="text-xs font-medium mb-1 text-muted-foreground">ARV Reasoning</p>
              <p className="text-sm text-muted-foreground">{analysis.arv_reasoning}</p>
            </div>
          )}

          {/* Recommendation */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
            <p className="text-sm font-medium mb-1">Recommendation</p>
            <p className="text-sm text-muted-foreground">{analysis.recommendation}</p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={runFullAnalysis}
              disabled={isLoading}
            >
              <Unlock className="mr-1.5 h-3 w-3" />
              Unlock All & Re-analyze
            </Button>
            <CashFlowCalculator
              purchasePrice={analysis.max_allowable_offer || 0}
              monthlyRent={analysis.rental_arv || 0}
              repairEstimate={analysis.repair_estimate || 0}
              propertyId={propertyId}
            />
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => runAnalysis(true)}
              disabled={isLoading}
            >
              <Zap className="mr-1.5 h-3 w-3" />
              Quick
            </Button>
          </div>
        </CardContent>
      </Card>

      <AnalysisSettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onApplyOverrides={handleApplyOverrides}
      />
    </>
  )
}
