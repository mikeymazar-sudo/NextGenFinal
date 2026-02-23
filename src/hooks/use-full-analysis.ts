'use client'

import { useState, useCallback } from 'react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import type { Property, DealAnalysis, AnalysisSettings } from '@/types/schema'

export type AnalysisStep =
  | 'rental_comps'
  | 'sold_comps'
  | 'photo_vision'
  | 'comp_images'
  | 'comp_vision'
  | 'full_analysis'

export interface StepStatus {
  step: AnalysisStep
  label: string
  status: 'pending' | 'running' | 'done' | 'skipped' | 'error'
  error?: string
}

interface UseFullAnalysisOptions {
  propertyId: string
  property: Property
  overrides?: Partial<AnalysisSettings>
  onAnalysisComplete: (analysis: DealAnalysis) => void
  onPropertyUpdate: (updates: Partial<Property>) => void
}

export function useFullAnalysis({
  propertyId,
  property,
  overrides,
  onAnalysisComplete,
  onPropertyUpdate,
}: UseFullAnalysisOptions) {
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState<StepStatus[]>([])
  const [currentStep, setCurrentStep] = useState<AnalysisStep | null>(null)

  const updateStep = useCallback(
    (step: AnalysisStep, status: StepStatus['status'], error?: string) => {
      setSteps((prev) =>
        prev.map((s) => (s.step === step ? { ...s, status, error } : s))
      )
    },
    []
  )

  const runFullAnalysis = useCallback(async () => {
    setRunning(true)

    // Determine which steps are needed
    const neededSteps: StepStatus[] = []

    if (!property.rental_data) {
      neededSteps.push({ step: 'rental_comps', label: 'Fetch rental comps', status: 'pending' })
    }

    if (!property.sold_data) {
      neededSteps.push({ step: 'sold_comps', label: 'Fetch sold comps', status: 'pending' })
    }

    // Always include photo vision if photos exist (check is lazy — the endpoint will skip if none)
    neededSteps.push({ step: 'photo_vision', label: 'Analyze property photos', status: 'pending' })

    // Comp images + vision only if we have comps
    if (property.sold_data || property.rental_data) {
      neededSteps.push({ step: 'comp_images', label: 'Fetch comp images', status: 'pending' })
      neededSteps.push({ step: 'comp_vision', label: 'Analyze comp images', status: 'pending' })
    }

    // Always run full analysis at the end
    neededSteps.push({ step: 'full_analysis', label: 'Run AI analysis', status: 'pending' })

    setSteps(neededSteps)

    // Execute each step sequentially
    for (const stepInfo of neededSteps) {
      setCurrentStep(stepInfo.step)
      updateStep(stepInfo.step, 'running')

      try {
        switch (stepInfo.step) {
          case 'rental_comps': {
            const res = await api.getRentalComps(
              propertyId,
              property.address,
              property.bedrooms ?? undefined,
              property.bathrooms ?? undefined,
              property.sqft ?? undefined
            )
            if (res.data) {
              onPropertyUpdate({ rental_data: res.data })
              updateStep('rental_comps', 'done')
            } else {
              updateStep('rental_comps', 'error', res.error)
            }
            break
          }

          case 'sold_comps': {
            const res = await api.getSoldComps(
              propertyId,
              property.address,
              property.bedrooms ?? undefined,
              property.bathrooms ?? undefined,
              property.sqft ?? undefined
            )
            if (res.data) {
              onPropertyUpdate({ sold_data: res.data })
              updateStep('sold_comps', 'done')
            } else {
              updateStep('sold_comps', 'error', res.error)
            }
            break
          }

          case 'photo_vision': {
            const res = await api.analyzePropertyPhotos(propertyId)
            if (res.error) {
              // Not a fatal error — may have no photos
              updateStep('photo_vision', 'skipped')
            } else {
              updateStep('photo_vision', 'done')
            }
            break
          }

          case 'comp_images': {
            // Gather comp addresses from both sold and rental
            const soldComps = property.sold_data?.comparables || []
            const rentalComps = property.rental_data?.comparables || []
            const compEntries = [
              ...soldComps.slice(0, 3).map((c: any) => ({
                address: c.formattedAddress || c.address || '',
                type: 'sold' as const,
              })),
              ...rentalComps.slice(0, 2).map((c: any) => ({
                address: c.formattedAddress || c.address || '',
                type: 'rental' as const,
              })),
            ].filter((c) => c.address)

            if (compEntries.length === 0) {
              updateStep('comp_images', 'skipped')
              break
            }

            const res = await api.fetchCompImages(propertyId, compEntries)
            if (res.error) {
              updateStep('comp_images', 'error', res.error)
            } else {
              updateStep('comp_images', 'done')
            }
            break
          }

          case 'comp_vision': {
            const res = await api.analyzeCompImages(propertyId)
            if (res.error) {
              updateStep('comp_vision', 'skipped')
            } else {
              updateStep('comp_vision', 'done')
            }
            break
          }

          case 'full_analysis': {
            const res = await api.analyzeProperty(propertyId, overrides, true)
            if (res.error) {
              updateStep('full_analysis', 'error', res.error)
              toast.error('Analysis failed: ' + res.error)
            } else if (res.data) {
              updateStep('full_analysis', 'done')
              onAnalysisComplete(res.data)
              toast.success('Full analysis complete!')
            }
            break
          }
        }
      } catch (error) {
        console.error(`Step ${stepInfo.step} failed:`, error)
        updateStep(stepInfo.step, 'error', 'Unexpected error')
      }
    }

    setRunning(false)
    setCurrentStep(null)
  }, [propertyId, property, overrides, onAnalysisComplete, onPropertyUpdate, updateStep])

  const completedCount = steps.filter(
    (s) => s.status === 'done' || s.status === 'skipped'
  ).length
  const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0

  return {
    running,
    steps,
    currentStep,
    progress,
    runFullAnalysis,
  }
}
