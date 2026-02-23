'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  MapPin,
  Scan,
  Loader2,
  Image as ImageIcon,
  CheckCircle,
  XCircle,
  Eye,
} from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'

interface CompImagesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  propertyId: string
  comps: Array<{ address: string; type: 'sold' | 'rental' }>
}

interface CompImageResult {
  address: string
  street_view: boolean
  listing_images: number
}

const conditionColors: Record<string, string> = {
  poor: 'bg-red-100 text-red-700',
  fair: 'bg-orange-100 text-orange-700',
  average: 'bg-yellow-100 text-yellow-700',
  good: 'bg-green-100 text-green-700',
  excellent: 'bg-emerald-100 text-emerald-700',
}

export function CompImagesDialog({
  open,
  onOpenChange,
  propertyId,
  comps,
}: CompImagesDialogProps) {
  const [fetching, setFetching] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [fetchResults, setFetchResults] = useState<CompImageResult[]>([])
  const [visionResults, setVisionResults] = useState<Record<string, Record<string, unknown>>>({})
  const [hasFetched, setHasFetched] = useState(false)

  const fetchCompImages = async () => {
    setFetching(true)
    const limitedComps = comps.slice(0, 5) // Max 5 comps

    const res = await api.fetchCompImages(propertyId, limitedComps)
    setFetching(false)

    if (res.error) {
      toast.error(res.error)
    } else if (res.data) {
      setFetchResults(res.data as CompImageResult[])
      setHasFetched(true)
      const totalImages = (res.data as CompImageResult[]).reduce(
        (sum, r) => sum + (r.street_view ? 1 : 0) + r.listing_images,
        0
      )
      toast.success(`Fetched ${totalImages} images from ${limitedComps.length} comps`)
    }
  }

  const analyzeCompImages = async () => {
    setAnalyzing(true)
    const res = await api.analyzeCompImages(propertyId)
    setAnalyzing(false)

    if (res.error) {
      toast.error(res.error)
    } else if (res.data) {
      setVisionResults(res.data as Record<string, Record<string, unknown>>)
      toast.success('Comp images analyzed!')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Comp Image Scanner
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Fetch Street View and listing photos for up to 5 comps, then analyze with AI vision.
          </p>

          {/* Comp list */}
          <div className="space-y-2">
            {comps.slice(0, 5).map((comp, i) => {
              const result = fetchResults.find((r) => r.address === comp.address)
              const vision = visionResults[comp.address]

              return (
                <div
                  key={i}
                  className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium truncate max-w-[250px]">
                        {comp.address}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {comp.type}
                    </Badge>
                  </div>

                  {/* Fetch results */}
                  {result && (
                    <div className="flex gap-2 text-xs">
                      <span className="flex items-center gap-1">
                        {result.street_view ? (
                          <CheckCircle className="h-3 w-3 text-green-500" />
                        ) : (
                          <XCircle className="h-3 w-3 text-zinc-400" />
                        )}
                        Street View
                      </span>
                      <span className="flex items-center gap-1">
                        {result.listing_images > 0 ? (
                          <CheckCircle className="h-3 w-3 text-green-500" />
                        ) : (
                          <XCircle className="h-3 w-3 text-zinc-400" />
                        )}
                        {result.listing_images} listing photos
                      </span>
                    </div>
                  )}

                  {/* Vision results */}
                  {vision && !('error' in vision) && (
                    <div className="space-y-1 border-t pt-2 mt-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          className={`text-[10px] ${
                            conditionColors[vision.condition_label as string] || ''
                          }`}
                        >
                          {vision.condition_rating as number}/10{' '}
                          {vision.condition_label as string}
                        </Badge>
                        {vision.price_justified !== undefined && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              vision.price_justified
                                ? 'text-green-600 border-green-300'
                                : 'text-amber-600 border-amber-300'
                            }`}
                          >
                            Price {vision.price_justified ? 'justified' : 'questionable'}
                          </Badge>
                        )}
                      </div>
                      {typeof vision.overall_notes === 'string' && (
                        <p className="text-[11px] text-muted-foreground">
                          {vision.overall_notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {comps.length > 5 && (
            <p className="text-[10px] text-muted-foreground">
              Showing first 5 of {comps.length} comps
            </p>
          )}

          <Separator />

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              onClick={fetchCompImages}
              disabled={fetching || comps.length === 0}
              variant="outline"
              className="flex-1"
            >
              {fetching ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Fetching...
                </>
              ) : (
                <>
                  <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                  {hasFetched ? 'Re-fetch Images' : 'Fetch Images'}
                </>
              )}
            </Button>
            <Button
              onClick={analyzeCompImages}
              disabled={analyzing || !hasFetched}
              className="flex-1"
            >
              {analyzing ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Scan className="mr-1.5 h-3.5 w-3.5" />
                  Analyze with AI
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
