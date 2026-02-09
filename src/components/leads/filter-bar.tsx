'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface FilterBarProps {
  status: string
  sortBy: string
  onStatusChange: (status: string) => void
  onSortChange: (sort: string) => void
}

export function FilterBar({ status, sortBy, onStatusChange, onSortChange }: FilterBarProps) {
  return (
    <div className="flex gap-3 flex-wrap">
      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="new">New</SelectItem>
          <SelectItem value="hot">Hot</SelectItem>
          <SelectItem value="cold">Cold</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
        </SelectContent>
      </Select>

      <Select value={sortBy} onValueChange={onSortChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Sort By" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest First</SelectItem>
          <SelectItem value="oldest">Oldest First</SelectItem>
          <SelectItem value="price_high">Price (High)</SelectItem>
          <SelectItem value="price_low">Price (Low)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
