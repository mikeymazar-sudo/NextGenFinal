'use client'

import { useState, useRef } from 'react'
import Papa from 'papaparse'
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
import { Upload, FileSpreadsheet, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface CsvUploadModalProps {
    onImportComplete: () => void
}

interface CsvRow {
    address?: string
    city?: string
    state?: string
    zip?: string
    bedrooms?: string
    bathrooms?: string
    sqft?: string
    year_built?: string
    lot_size?: string
    property_type?: string
    list_price?: string
    owner_name?: string
    [key: string]: string | undefined
}

interface ImportResult {
    imported: number
    skipped: number
    errors: number
}

// Common column name mappings
const COLUMN_MAPPINGS: Record<string, string> = {
    // Address variations
    'address': 'address',
    'street': 'address',
    'street_address': 'address',
    'property_address': 'address',
    'propertyaddress': 'address',
    'full_address': 'address',

    // City variations
    'city': 'city',
    'property_city': 'city',

    // State variations
    'state': 'state',
    'st': 'state',
    'property_state': 'state',

    // Zip variations
    'zip': 'zip',
    'zipcode': 'zip',
    'zip_code': 'zip',
    'postal': 'zip',
    'postal_code': 'zip',

    // Bedroom variations
    'bedrooms': 'bedrooms',
    'beds': 'bedrooms',
    'bed': 'bedrooms',
    'br': 'bedrooms',

    // Bathroom variations
    'bathrooms': 'bathrooms',
    'baths': 'bathrooms',
    'bath': 'bathrooms',
    'ba': 'bathrooms',

    // Sqft variations
    'sqft': 'sqft',
    'square_feet': 'sqft',
    'squarefeet': 'sqft',
    'living_area': 'sqft',
    'size': 'sqft',

    // Year built variations
    'year_built': 'year_built',
    'yearbuilt': 'year_built',
    'built': 'year_built',
    'year': 'year_built',

    // Lot size variations
    'lot_size': 'lot_size',
    'lotsize': 'lot_size',
    'lot': 'lot_size',
    'lot_sqft': 'lot_size',

    // Property type variations
    'property_type': 'property_type',
    'propertytype': 'property_type',
    'type': 'property_type',

    // Price variations
    'list_price': 'list_price',
    'listprice': 'list_price',
    'price': 'list_price',
    'asking_price': 'list_price',
    'value': 'list_price',

    // Owner variations
    'owner_name': 'owner_name',
    'ownername': 'owner_name',
    'owner': 'owner_name',
    'owner_full_name': 'owner_name',
}

function normalizeColumnName(col: string): string {
    const normalized = col.toLowerCase().trim().replace(/\s+/g, '_')
    return COLUMN_MAPPINGS[normalized] || normalized
}

export function CsvUploadModal({ onImportComplete }: CsvUploadModalProps) {
    const [open, setOpen] = useState(false)
    const [file, setFile] = useState<File | null>(null)
    const [listName, setListName] = useState('')
    const [preview, setPreview] = useState<CsvRow[]>([])
    const [totalRows, setTotalRows] = useState(0)
    const [columns, setColumns] = useState<string[]>([])
    const [importing, setImporting] = useState(false)
    const [progress, setProgress] = useState(0)
    const [result, setResult] = useState<ImportResult | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (!selectedFile) return

        if (!selectedFile.name.endsWith('.csv')) {
            toast.error('Please select a CSV file')
            return
        }

        setFile(selectedFile)
        setResult(null)

        // Parse CSV for preview
        Papa.parse<CsvRow>(selectedFile, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const rows = results.data
                setTotalRows(rows.length)
                setPreview(rows.slice(0, 5))

                // Get normalized column names
                if (rows.length > 0) {
                    const originalCols = Object.keys(rows[0])
                    setColumns(originalCols.map(normalizeColumnName))
                }
            },
            error: (error) => {
                toast.error(`Failed to parse CSV: ${error.message}`)
            },
        })
    }

    const handleImport = async () => {
        if (!file) return

        setImporting(true)
        setProgress(0)
        setResult(null)

        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            toast.error('You must be logged in')
            setImporting(false)
            return
        }

        const { data: profile } = await supabase
            .from('user_profiles')
            .select('team_id')
            .eq('id', user.id)
            .single()

        let imported = 0
        let skipped = 0
        let errors = 0

        // Create the lead list first
        let listId: string | null = null
        if (listName.trim()) {
            const { data: listData, error: listError } = await supabase
                .from('lead_lists')
                .insert({
                    name: listName.trim(),
                    created_by: user.id,
                    team_id: profile?.team_id || null,
                })
                .select('id')
                .single()

            if (listError) {
                console.error('Failed to create list:', listError)
                toast.error('Failed to create lead list')
            } else {
                listId = listData.id
            }
        }

        Papa.parse<CsvRow>(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rows = results.data
                const batchSize = 100

                for (let i = 0; i < rows.length; i += batchSize) {
                    const batch = rows.slice(i, i + batchSize)

                    const properties = batch
                        .map((row) => {
                            // Normalize column names in the row
                            const normalized: CsvRow = {}
                            Object.entries(row).forEach(([key, value]) => {
                                normalized[normalizeColumnName(key)] = value
                            })

                            const address = normalized.address?.trim()
                            if (!address) {
                                skipped++
                                return null
                            }

                            return {
                                address,
                                city: normalized.city?.trim() || null,
                                state: normalized.state?.trim() || null,
                                zip: normalized.zip?.trim() || null,
                                bedrooms: normalized.bedrooms ? parseInt(normalized.bedrooms) || null : null,
                                bathrooms: normalized.bathrooms ? parseFloat(normalized.bathrooms) || null : null,
                                sqft: normalized.sqft ? parseInt(normalized.sqft.replace(/,/g, '')) || null : null,
                                year_built: normalized.year_built ? parseInt(normalized.year_built) || null : null,
                                lot_size: normalized.lot_size ? parseInt(normalized.lot_size.replace(/,/g, '')) || null : null,
                                property_type: normalized.property_type?.trim() || null,
                                list_price: normalized.list_price ? parseInt(normalized.list_price.replace(/[,$]/g, '')) || null : null,
                                owner_name: normalized.owner_name?.trim() || null,
                                status: 'new' as const,
                                created_by: user.id,
                                team_id: profile?.team_id || null,
                                list_id: listId,
                            }
                        })
                        .filter(Boolean)

                    if (properties.length > 0) {
                        const { data, error } = await supabase
                            .from('properties')
                            .insert(properties)
                            .select('id')

                        if (error) {
                            console.error('Batch insert error:', error)
                            errors += properties.length
                        } else {
                            imported += data?.length || 0
                        }
                    }

                    setProgress(Math.round(((i + batch.length) / rows.length) * 100))
                }

                setResult({ imported, skipped, errors })
                setImporting(false)

                if (imported > 0) {
                    toast.success(`Imported ${imported} properties!`)
                    onImportComplete()
                }
            },
        })
    }

    const resetModal = () => {
        setFile(null)
        setListName('')
        setPreview([])
        setTotalRows(0)
        setColumns([])
        setProgress(0)
        setResult(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => {
            setOpen(isOpen)
            if (!isOpen) resetModal()
        }}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload CSV
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Import Properties from CSV</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                    {/* File Input */}
                    <div className="border-2 border-dashed rounded-lg p-6 text-center">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            onChange={handleFileSelect}
                            className="hidden"
                            id="csv-upload"
                        />
                        <label htmlFor="csv-upload" className="cursor-pointer">
                            <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                            {file ? (
                                <p className="text-sm font-medium">{file.name}</p>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    Click to select a CSV file
                                </p>
                            )}
                        </label>
                    </div>

                    {/* List Name Input */}
                    {file && (
                        <div className="space-y-2">
                            <Label htmlFor="list-name">List Name *</Label>
                            <Input
                                id="list-name"
                                placeholder="e.g., Miami Homeowners Jan 2026"
                                value={listName}
                                onChange={(e) => setListName(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Give this import a name to organize and filter leads later.
                            </p>
                        </div>
                    )}

                    {/* Column Mapping Info */}
                    {columns.length > 0 && (
                        <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground mb-1">Detected columns:</p>
                            <p className="text-xs font-mono">{columns.join(', ')}</p>
                        </div>
                    )}

                    {/* Preview Table */}
                    {preview.length > 0 && (
                        <div>
                            <p className="text-sm font-medium mb-2">
                                Preview ({totalRows} total rows)
                            </p>
                            <div className="border rounded-lg overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-zinc-50 dark:bg-zinc-800">
                                        <tr>
                                            <th className="px-2 py-1.5 text-left">Address</th>
                                            <th className="px-2 py-1.5 text-left">City</th>
                                            <th className="px-2 py-1.5 text-left">State</th>
                                            <th className="px-2 py-1.5 text-left">Owner</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.map((row, i) => {
                                            const normalized: CsvRow = {}
                                            Object.entries(row).forEach(([key, value]) => {
                                                normalized[normalizeColumnName(key)] = value
                                            })
                                            return (
                                                <tr key={i} className="border-t">
                                                    <td className="px-2 py-1.5">{normalized.address || '-'}</td>
                                                    <td className="px-2 py-1.5">{normalized.city || '-'}</td>
                                                    <td className="px-2 py-1.5">{normalized.state || '-'}</td>
                                                    <td className="px-2 py-1.5">{normalized.owner_name || '-'}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Progress Bar */}
                    {importing && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span>Importing...</span>
                                <span>{progress}%</span>
                            </div>
                            <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-600 transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Results */}
                    {result && (
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-green-600">
                                <CheckCircle className="h-4 w-4" />
                                <span>{result.imported} imported successfully</span>
                            </div>
                            {result.skipped > 0 && (
                                <div className="flex items-center gap-2 text-amber-600">
                                    <XCircle className="h-4 w-4" />
                                    <span>{result.skipped} skipped (missing address)</span>
                                </div>
                            )}
                            {result.errors > 0 && (
                                <div className="flex items-center gap-2 text-red-600">
                                    <XCircle className="h-4 w-4" />
                                    <span>{result.errors} errors</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                        {!result ? (
                            <Button
                                onClick={handleImport}
                                disabled={!file || importing || !listName.trim()}
                                className="flex-1"
                            >
                                {importing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Importing...
                                    </>
                                ) : (
                                    `Import ${totalRows} Properties`
                                )}
                            </Button>
                        ) : (
                            <Button onClick={() => setOpen(false)} className="flex-1">
                                Done
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
