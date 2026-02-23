'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Lock,
  Unlock,
} from 'lucide-react'
import type { Property } from '@/types/schema'
import type { StepStatus } from '@/hooks/use-full-analysis'

interface DataCompletenessProps {
  property: Property
  photoCount: number
  transcriptCount: number
  messageCount: number
  running: boolean
  steps: StepStatus[]
  progress: number
  onUnlockAll: () => void
}

interface DataItem {
  label: string
  available: boolean
  detail?: string
}

export function DataCompleteness({
  property,
  photoCount,
  transcriptCount,
  messageCount,
  running,
  steps,
  progress,
  onUnlockAll,
}: DataCompletenessProps) {
  const items: DataItem[] = [
    {
      label: 'Property data',
      available: !!property.raw_realestate_data,
    },
    {
      label: 'Rental comps',
      available: !!property.rental_data,
      detail: property.rental_data
        ? `${property.rental_data.comparables?.length || 0} comps`
        : undefined,
    },
    {
      label: 'Sold comps',
      available: !!property.sold_data,
      detail: property.sold_data
        ? `${property.sold_data.comparables?.length || 0} comps`
        : undefined,
    },
    {
      label: 'Skip trace',
      available: !!(property.owner_phone && property.owner_phone.length > 0),
    },
    {
      label: 'Transcripts',
      available: transcriptCount > 0,
      detail: transcriptCount > 0 ? `${transcriptCount}` : undefined,
    },
    {
      label: 'Photos',
      available: photoCount > 0,
      detail: `${photoCount}/50`,
    },
    {
      label: 'SMS',
      available: messageCount > 0,
      detail: messageCount > 0 ? `${messageCount} msgs` : undefined,
    },
    {
      label: 'AI Analysis',
      available: !!property.ai_analysis,
    },
  ]

  const completedCount = items.filter((i) => i.available).length
  const completeness = Math.round((completedCount / items.length) * 100)

  return (
    <div className="space-y-2">
      {/* Progress indicator */}
      {running && steps.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Processing...</span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5">
            <div
              className="bg-purple-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="space-y-1">
            {steps.map((step) => (
              <div key={step.step} className="flex items-center gap-2 text-xs">
                {step.status === 'running' ? (
                  <Loader2 className="h-3 w-3 animate-spin text-purple-600" />
                ) : step.status === 'done' ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : step.status === 'error' ? (
                  <XCircle className="h-3 w-3 text-red-500" />
                ) : step.status === 'skipped' ? (
                  <CheckCircle2 className="h-3 w-3 text-zinc-400" />
                ) : (
                  <div className="h-3 w-3 rounded-full border border-zinc-300" />
                )}
                <span
                  className={
                    step.status === 'running'
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground'
                  }
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data status grid */}
      {!running && (
        <>
          <div className="grid grid-cols-4 gap-1">
            {items.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-1 text-[10px]"
                title={item.detail}
              >
                {item.available ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                ) : (
                  <XCircle className="h-3 w-3 text-zinc-300 flex-shrink-0" />
                )}
                <span className={item.available ? 'text-foreground' : 'text-muted-foreground'}>
                  {item.label}
                </span>
                {item.detail && (
                  <span className="text-muted-foreground">({item.detail})</span>
                )}
              </div>
            ))}
          </div>

          {/* Completeness bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-zinc-200 dark:bg-zinc-700 rounded-full h-1">
              <div
                className={`h-1 rounded-full transition-all ${
                  completeness >= 75
                    ? 'bg-green-500'
                    : completeness >= 50
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${completeness}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground font-medium">
              {completeness}%
            </span>
          </div>
        </>
      )}
    </div>
  )
}
