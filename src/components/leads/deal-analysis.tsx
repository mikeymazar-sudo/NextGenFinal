'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Brain, RefreshCw, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import type { DealAnalysis } from '@/types/schema'

const gradeColors: Record<string, string> = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-lime-100 text-lime-700',
  C: 'bg-yellow-100 text-yellow-700',
  D: 'bg-orange-100 text-orange-700',
  F: 'bg-red-100 text-red-700',
}

interface DealAnalysisProps {
  propertyId: string
  existingAnalysis: DealAnalysis | null
  analyzedAt: string | null
  hasRentalData: boolean
}

export function DealAnalysisCard({ propertyId, existingAnalysis, analyzedAt, hasRentalData }: DealAnalysisProps) {
  const [analysis, setAnalysis] = useState<DealAnalysis | null>(existingAnalysis)
  const [loading, setLoading] = useState(false)
  const [cached, setCached] = useState(!!existingAnalysis)

  const runAnalysis = async () => {
    setLoading(true)
    const result = await api.analyzeProperty(propertyId)
    setLoading(false)

    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      setAnalysis(result.data)
      setCached(result.cached || false)
      toast.success(result.cached ? 'Loaded cached analysis' : 'Analysis complete!')
    }
  }

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-600" />
            AI Deal Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <p className="text-sm text-muted-foreground animate-pulse">Analyzing deal...</p>
        </CardContent>
      </Card>
    )
  }

  if (!analysis) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-600" />
            AI Deal Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasRentalData && (
            <p className="text-xs text-muted-foreground mb-3">
              Tip: Get rental estimates first for a more accurate analysis.
            </p>
          )}
          <Button onClick={runAnalysis} className="w-full">
            <Brain className="mr-2 h-4 w-4" />
            Analyze with AI
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-4 w-4 text-purple-600" />
          AI Deal Analysis
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge className={gradeColors[analysis.deal_grade] || 'bg-zinc-100'}>
            Grade: {analysis.deal_grade}
          </Badge>
          <Button variant="ghost" size="icon" onClick={runAnalysis} title="Re-analyze">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {cached && analyzedAt && (
          <p className="text-xs text-muted-foreground">
            Analyzed on {new Date(analyzedAt).toLocaleDateString()}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">ARV</p>
            <p className="text-lg font-bold">${analysis.arv.toLocaleString()}</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">MAO (70% Rule)</p>
            <p className="text-lg font-bold">${analysis.max_allowable_offer.toLocaleString()}</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Repair Estimate</p>
            <p className="text-lg font-bold">${analysis.repair_estimate.toLocaleString()}</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Confidence</p>
            <p className="text-lg font-bold capitalize">{analysis.confidence}</p>
          </div>
        </div>

        {analysis.rental_arv && (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Rental ARV</p>
            <p className="text-lg font-bold">${analysis.rental_arv.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{analysis.rental_arv_reasoning}</p>
          </div>
        )}

        {analysis.repair_breakdown && Object.keys(analysis.repair_breakdown).length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Repair Breakdown</p>
            <div className="space-y-1">
              {Object.entries(analysis.repair_breakdown).map(([key, value]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="font-medium">${value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {analysis.risk_factors.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              Risk Factors
            </p>
            <ul className="space-y-1">
              {analysis.risk_factors.map((risk, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-amber-500 mt-1">•</span>
                  {risk}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
          <p className="text-sm font-medium mb-1">Recommendation</p>
          <p className="text-sm text-muted-foreground">{analysis.recommendation}</p>
        </div>
      </CardContent>
    </Card>
  )
}
