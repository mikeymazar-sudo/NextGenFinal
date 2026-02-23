'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, Camera, X, Loader2 } from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import type { PropertyPhoto } from '@/types/schema'

interface PhotoUploadProps {
  propertyId: string
  photoCount: number
  onPhotoUploaded: (photo: PropertyPhoto & { url: string | null }) => void
}

function resizeImage(file: File, maxDimension: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width)
            width = maxDimension
          } else {
            width = Math.round((width * maxDimension) / height)
            height = maxDimension
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas context unavailable'))

        ctx.drawImage(img, 0, 0, width, height)
        const base64 = canvas.toDataURL('image/jpeg', 0.85)
        resolve(base64)
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function PhotoUpload({ propertyId, photoCount, onPhotoUploaded }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const remaining = 50 - photoCount

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'))

      if (fileArray.length === 0) {
        toast.error('Please select image files.')
        return
      }

      if (fileArray.length > remaining) {
        toast.error(`Can only upload ${remaining} more photos (50 max).`)
        return
      }

      setUploading(true)
      setUploadProgress({ current: 0, total: fileArray.length })

      let successCount = 0

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]
        setUploadProgress({ current: i + 1, total: fileArray.length })

        try {
          // Resize client-side
          const base64 = await resizeImage(file, 2048)

          const result = await api.uploadPhoto(propertyId, base64, file.name)

          if (result.data) {
            successCount++
            onPhotoUploaded({ ...result.data, url: base64 }) // Use local base64 as preview
          } else if (result.error) {
            console.error(`Upload failed for ${file.name}:`, result.error)
          }
        } catch (err) {
          console.error(`Failed to process ${file.name}:`, err)
        }
      }

      setUploading(false)
      setUploadProgress({ current: 0, total: 0 })

      if (successCount > 0) {
        toast.success(`${successCount} photo${successCount > 1 ? 's' : ''} uploaded!`)
      }
      if (successCount < fileArray.length) {
        toast.error(`${fileArray.length - successCount} photo(s) failed to upload.`)
      }
    },
    [propertyId, remaining, onPhotoUploaded]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files)
      }
    },
    [handleFiles]
  )

  if (remaining <= 0) {
    return (
      <div className="text-center py-3">
        <p className="text-xs text-muted-foreground">Maximum 50 photos reached.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer
          ${isDragging ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'}
          ${uploading ? 'pointer-events-none opacity-60' : ''}
        `}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
            <p className="text-sm text-muted-foreground">
              Uploading {uploadProgress.current} of {uploadProgress.total}...
            </p>
            <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5">
              <div
                className="bg-purple-600 h-1.5 rounded-full transition-all"
                style={{
                  width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drag & drop photos or click to browse
            </p>
            <p className="text-[10px] text-muted-foreground">
              {remaining} photo{remaining !== 1 ? 's' : ''} remaining
            </p>
          </div>
        )}
      </div>

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {/* Camera button (mobile) */}
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs"
        onClick={() => cameraInputRef.current?.click()}
        disabled={uploading}
      >
        <Camera className="mr-1.5 h-3 w-3" />
        Take Photo
      </Button>
    </div>
  )
}
