'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Camera,
  Trash2,
  Scan,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  Wrench,
  AlertCircle,
} from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import { PhotoUpload } from './photo-upload'
import type { PropertyPhoto, VisionAssessment } from '@/types/schema'

type PhotoWithUrl = PropertyPhoto & { url: string | null }

interface PhotoGalleryProps {
  propertyId: string
}

const conditionColors: Record<string, string> = {
  poor: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  fair: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  average: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  good: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  excellent: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
}

export function PhotoGallery({ propertyId }: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [aggregate, setAggregate] = useState<Record<string, unknown> | null>(null)

  // Load photos on mount
  useEffect(() => {
    loadPhotos()
  }, [propertyId])

  const loadPhotos = async () => {
    setLoading(true)
    const res = await api.getPhotos(propertyId)
    if (res.data) {
      setPhotos(res.data as PhotoWithUrl[])
    }
    setLoading(false)
  }

  const handlePhotoUploaded = (photo: PhotoWithUrl) => {
    setPhotos((prev) => [...prev, photo])
  }

  const handleDelete = async (photoId: string) => {
    const res = await api.deletePhoto(photoId)
    if (res.error) {
      toast.error('Failed to delete photo')
    } else {
      setPhotos((prev) => prev.filter((p) => p.id !== photoId))
      toast.success('Photo deleted')
    }
  }

  const runVisionAnalysis = async () => {
    if (photos.length === 0) {
      toast.error('Upload photos first.')
      return
    }

    setAnalyzing(true)
    const res = await api.analyzePropertyPhotos(propertyId)
    setAnalyzing(false)

    if (res.error) {
      toast.error(res.error)
    } else if (res.data) {
      setAggregate(res.data.aggregate as Record<string, unknown>)
      toast.success(`Analyzed ${photos.length} photos!`)
      // Reload photos to get updated vision assessments
      loadPhotos()
    }
  }

  const openLightbox = (index: number) => setLightboxIndex(index)
  const closeLightbox = () => setLightboxIndex(null)
  const nextPhoto = () =>
    setLightboxIndex((prev) => (prev !== null ? (prev + 1) % photos.length : null))
  const prevPhoto = () =>
    setLightboxIndex((prev) =>
      prev !== null ? (prev - 1 + photos.length) % photos.length : null
    )

  const currentPhoto = lightboxIndex !== null ? photos[lightboxIndex] : null
  const hasVisionData = photos.some((p) => p.vision_assessment)

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4 text-purple-600" />
            Property Photos
            {photos.length > 0 && (
              <Badge variant="secondary" className="text-[10px] ml-1">
                {photos.length}/50
              </Badge>
            )}
          </CardTitle>
          {photos.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={runVisionAnalysis}
              disabled={analyzing}
              className="text-xs"
            >
              {analyzing ? (
                <>
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Scan className="mr-1.5 h-3 w-3" />
                  {hasVisionData ? 'Re-analyze' : 'Analyze Photos'}
                </>
              )}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Aggregate Vision Results */}
          {aggregate && (
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">Vision Assessment</p>
                <Badge
                  className={
                    conditionColors[
                      (aggregate.condition_label as string) || 'average'
                    ] || ''
                  }
                >
                  {(aggregate.condition_rating as number) || '?'}/10{' '}
                  {(aggregate.condition_label as string) || ''}
                </Badge>
              </div>

              {aggregate.total_repair_low !== undefined && (
                <div className="flex items-center gap-1.5 text-sm">
                  <Wrench className="h-3.5 w-3.5 text-amber-600" />
                  <span className="font-medium">
                    Repair Est: ${(aggregate.total_repair_low as number).toLocaleString()} -{' '}
                    ${(aggregate.total_repair_high as number).toLocaleString()}
                  </span>
                </div>
              )}

              {(aggregate.unique_issues as string[])?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium">Issues Found:</p>
                  <div className="flex flex-wrap gap-1">
                    {(aggregate.unique_issues as string[]).slice(0, 8).map((issue, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] font-normal">
                        <AlertCircle className="h-2.5 w-2.5 mr-0.5 text-amber-500" />
                        {issue}
                      </Badge>
                    ))}
                    {(aggregate.unique_issues as string[]).length > 8 && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        +{(aggregate.unique_issues as string[]).length - 8} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Photo Grid */}
          {loading ? (
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="aspect-square bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : photos.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {photos.map((photo, index) => (
                <div
                  key={photo.id}
                  className="relative group aspect-square rounded-lg overflow-hidden cursor-pointer bg-zinc-100 dark:bg-zinc-800"
                  onClick={() => openLightbox(index)}
                >
                  {photo.url && (
                    <img
                      src={photo.url}
                      alt={photo.filename}
                      className="w-full h-full object-cover"
                    />
                  )}

                  {/* Vision badge */}
                  {photo.vision_assessment && (
                    <div className="absolute top-1 left-1">
                      <Badge
                        className={`text-[9px] px-1 py-0 ${
                          conditionColors[photo.vision_assessment.condition_label] || ''
                        }`}
                      >
                        {photo.vision_assessment.condition_rating}/10
                      </Badge>
                    </div>
                  )}

                  {/* Delete overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-white hover:text-red-400 hover:bg-transparent"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(photo.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Upload */}
          <PhotoUpload
            propertyId={propertyId}
            photoCount={photos.length}
            onPhotoUploaded={handlePhotoUploaded}
          />
        </CardContent>
      </Card>

      {/* Lightbox */}
      <Dialog open={lightboxIndex !== null} onOpenChange={() => closeLightbox()}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="p-3 pb-0">
            <DialogTitle className="text-sm">
              {currentPhoto?.filename || 'Photo'}{' '}
              <span className="text-muted-foreground font-normal">
                ({(lightboxIndex ?? 0) + 1} of {photos.length})
              </span>
            </DialogTitle>
          </DialogHeader>

          {currentPhoto && (
            <div className="relative">
              {/* Image */}
              <div className="flex items-center justify-center bg-black min-h-[300px] max-h-[60vh]">
                {currentPhoto.url && (
                  <img
                    src={currentPhoto.url}
                    alt={currentPhoto.filename}
                    className="max-w-full max-h-[60vh] object-contain"
                  />
                )}
              </div>

              {/* Nav buttons */}
              {photos.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 h-8 w-8"
                    onClick={prevPhoto}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 h-8 w-8"
                    onClick={nextPhoto}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </>
              )}

              {/* Vision assessment details */}
              {currentPhoto.vision_assessment && (
                <div className="p-3 space-y-2 border-t">
                  <div className="flex items-center justify-between">
                    <Badge
                      className={
                        conditionColors[currentPhoto.vision_assessment.condition_label] || ''
                      }
                    >
                      Condition: {currentPhoto.vision_assessment.condition_rating}/10 (
                      {currentPhoto.vision_assessment.condition_label})
                    </Badge>
                    {currentPhoto.vision_assessment.curb_appeal_score && (
                      <Badge variant="outline" className="text-xs">
                        Curb Appeal: {currentPhoto.vision_assessment.curb_appeal_score}/10
                      </Badge>
                    )}
                  </div>

                  {currentPhoto.vision_assessment.overall_notes && (
                    <p className="text-xs text-muted-foreground">
                      {currentPhoto.vision_assessment.overall_notes}
                    </p>
                  )}

                  {currentPhoto.vision_assessment.repair_items?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Repair Items:</p>
                      {currentPhoto.vision_assessment.repair_items.map((item, i) => (
                        <div
                          key={i}
                          className="flex justify-between text-xs bg-zinc-50 dark:bg-zinc-800 rounded p-1.5"
                        >
                          <span className="text-muted-foreground">{item.item}</span>
                          <span className="font-medium">
                            ${item.estimated_cost_low.toLocaleString()}-$
                            {item.estimated_cost_high.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
