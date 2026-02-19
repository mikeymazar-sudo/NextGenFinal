'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Loader2 } from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'

interface PropertySearchProps {
  onPropertyFound: () => void
}

export function PropertySearch({ onPropertyFound }: PropertySearchProps) {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    if (!address.trim()) return

    setLoading(true)
    const result = await api.lookupProperty(address.trim())
    setLoading(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(result.cached ? 'Property found in database!' : 'Property added successfully!')
      setAddress('')
      onPropertyFound()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by address (e.g., 123 Main St, Miami, FL)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={handleKeyDown}
          className="pl-9"
          disabled={loading}
        />
      </div>
      <Button onClick={handleSearch} disabled={loading || !address.trim()}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
      </Button>
    </div>
  )
}
