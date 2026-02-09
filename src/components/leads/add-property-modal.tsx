'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Plus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

const PROPERTY_TYPES = [
    'Single Family',
    'Multi Family',
    'Condo',
    'Townhouse',
    'Mobile Home',
    'Land',
    'Commercial',
    'Other',
]

interface AddPropertyModalProps {
    onPropertyAdded: () => void
}

export function AddPropertyModal({ onPropertyAdded }: AddPropertyModalProps) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        address: '',
        city: '',
        state: '',
        zip: '',
        bedrooms: '',
        bathrooms: '',
        sqft: '',
        year_built: '',
        lot_size: '',
        property_type: '',
        list_price: '',
        owner_name: '',
    })

    const handleChange = (field: string, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.address.trim()) {
            toast.error('Address is required')
            return
        }

        setLoading(true)
        const supabase = createClient()

        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            toast.error('You must be logged in')
            setLoading(false)
            return
        }

        // Get user's team_id
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('team_id')
            .eq('id', user.id)
            .single()

        const propertyData = {
            address: formData.address.trim(),
            city: formData.city.trim() || null,
            state: formData.state.trim() || null,
            zip: formData.zip.trim() || null,
            bedrooms: formData.bedrooms ? parseInt(formData.bedrooms) : null,
            bathrooms: formData.bathrooms ? parseFloat(formData.bathrooms) : null,
            sqft: formData.sqft ? parseInt(formData.sqft) : null,
            year_built: formData.year_built ? parseInt(formData.year_built) : null,
            lot_size: formData.lot_size ? parseInt(formData.lot_size) : null,
            property_type: formData.property_type || null,
            list_price: formData.list_price ? parseInt(formData.list_price.replace(/,/g, '')) : null,
            owner_name: formData.owner_name.trim() || null,
            status: 'new' as const,
            created_by: user.id,
            team_id: profile?.team_id || null,
        }

        const { data, error } = await supabase
            .from('properties')
            .insert(propertyData)
            .select()
            .single()

        setLoading(false)

        if (error) {
            console.error('Error adding property:', error)
            toast.error('Failed to add property')
            return
        }

        toast.success('Property added successfully!')
        setOpen(false)
        setFormData({
            address: '',
            city: '',
            state: '',
            zip: '',
            bedrooms: '',
            bathrooms: '',
            sqft: '',
            year_built: '',
            lot_size: '',
            property_type: '',
            list_price: '',
            owner_name: '',
        })
        onPropertyAdded()
        router.push(`/leads/${data.id}`)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Property
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Add Property Manually</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    {/* Address - Required */}
                    <div className="space-y-2">
                        <Label htmlFor="address">Address *</Label>
                        <Input
                            id="address"
                            placeholder="123 Main St"
                            value={formData.address}
                            onChange={(e) => handleChange('address', e.target.value)}
                            required
                        />
                    </div>

                    {/* City, State, Zip */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="city">City</Label>
                            <Input
                                id="city"
                                placeholder="Miami"
                                value={formData.city}
                                onChange={(e) => handleChange('city', e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="state">State</Label>
                            <Input
                                id="state"
                                placeholder="FL"
                                maxLength={2}
                                value={formData.state}
                                onChange={(e) => handleChange('state', e.target.value.toUpperCase())}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="zip">Zip</Label>
                            <Input
                                id="zip"
                                placeholder="33101"
                                maxLength={10}
                                value={formData.zip}
                                onChange={(e) => handleChange('zip', e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Property Details */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="bedrooms">Beds</Label>
                            <Input
                                id="bedrooms"
                                type="number"
                                min="0"
                                placeholder="3"
                                value={formData.bedrooms}
                                onChange={(e) => handleChange('bedrooms', e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bathrooms">Baths</Label>
                            <Input
                                id="bathrooms"
                                type="number"
                                min="0"
                                step="0.5"
                                placeholder="2"
                                value={formData.bathrooms}
                                onChange={(e) => handleChange('bathrooms', e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="sqft">Sqft</Label>
                            <Input
                                id="sqft"
                                type="number"
                                min="0"
                                placeholder="1500"
                                value={formData.sqft}
                                onChange={(e) => handleChange('sqft', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="year_built">Year Built</Label>
                            <Input
                                id="year_built"
                                type="number"
                                min="1800"
                                max={new Date().getFullYear()}
                                placeholder="1990"
                                value={formData.year_built}
                                onChange={(e) => handleChange('year_built', e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lot_size">Lot Size (sqft)</Label>
                            <Input
                                id="lot_size"
                                type="number"
                                min="0"
                                placeholder="5000"
                                value={formData.lot_size}
                                onChange={(e) => handleChange('lot_size', e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Property Type */}
                    <div className="space-y-2">
                        <Label htmlFor="property_type">Property Type</Label>
                        <Select
                            value={formData.property_type}
                            onValueChange={(value) => handleChange('property_type', value)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                                {PROPERTY_TYPES.map((type) => (
                                    <SelectItem key={type} value={type}>
                                        {type}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Price and Owner */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="list_price">List Price</Label>
                            <Input
                                id="list_price"
                                placeholder="250,000"
                                value={formData.list_price}
                                onChange={(e) => handleChange('list_price', e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="owner_name">Owner Name</Label>
                            <Input
                                id="owner_name"
                                placeholder="John Smith"
                                value={formData.owner_name}
                                onChange={(e) => handleChange('owner_name', e.target.value)}
                            />
                        </div>
                    </div>

                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Adding...
                            </>
                        ) : (
                            'Add Property'
                        )}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    )
}
