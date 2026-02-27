'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Minus, Maximize2, Send, Loader2, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { api } from '@/lib/api/client'
import { cn } from '@/lib/utils'

export interface EmailComposerProps {
    isOpen: boolean
    onClose: () => void
    initialTo: string
    allEmails?: string[]
    replyTo?: string
    property: {
        id: string
        address: string
        city: string | null
        state: string | null
        zip: string | null
        price: number | null
        bedrooms: number | null
        bathrooms: number | null
        sqft: number | null
        ownerName: string | null
    }
}

type TemplateType = 'property_details' | 'follow_up' | 'offer_sent' | 'custom'

const CUSTOM_ADDRESS_VALUE = '__custom__'

const templates: { value: TemplateType; label: string; description: string }[] = [
    { value: 'custom', label: 'Blank', description: 'Start from scratch' },
    { value: 'property_details', label: 'Property Details', description: 'Share full property info' },
    { value: 'follow_up', label: 'Follow Up', description: 'Check in with owner' },
    { value: 'offer_sent', label: 'Offer Sent', description: 'Present a cash offer' },
]

export function EmailComposer({ isOpen, onClose, initialTo, allEmails = [], replyTo, property }: EmailComposerProps) {
    const [isMinimized, setIsMinimized] = useState(false)

    // To field — track selected from dropdown + optional custom override
    const [selectedTo, setSelectedTo] = useState(initialTo)
    const [customTo, setCustomTo] = useState('')

    const [subject, setSubject] = useState('')
    const [body, setBody] = useState('')
    const [template, setTemplate] = useState<TemplateType>('custom')
    const [offerAmount, setOfferAmount] = useState('')
    const [sending, setSending] = useState(false)

    // Dragging state
    const [position, setPosition] = useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const dragStartRef = useRef({ x: 0, y: 0 })
    const startPosRef = useRef({ x: 0, y: 0 })
    const windowRef = useRef<HTMLDivElement>(null)

    // Sync "To" when initialTo changes (e.g. user switched selected email in skip-trace)
    useEffect(() => {
        setSelectedTo(initialTo)
        setCustomTo('')
    }, [initialTo])

    // Resolve the actual "to" address to send to
    const effectiveTo = selectedTo === CUSTOM_ADDRESS_VALUE ? customTo : selectedTo

    const handleTemplateChange = (value: string) => {
        const newVal = value as TemplateType
        setTemplate(newVal)

        const address = property.address
        const fullAddress = [property.address, property.city, property.state, property.zip].filter(Boolean).join(', ')
        const price = property.price ? `$${Number(property.price).toLocaleString()}` : 'Price TBD'
        const specs = `${property.bedrooms || '?'} beds, ${property.bathrooms || '?'} baths, ${property.sqft ? Number(property.sqft).toLocaleString() : '?'} sqft`
        const ownerGreeting = `Hi ${property.ownerName || 'there'},\n\n`

        switch (newVal) {
            case 'property_details':
                setSubject(`Property Details: ${address}`)
                setBody(
                    ownerGreeting +
                    `Here are the details for the property:\n\n` +
                    `Address: ${fullAddress}\n` +
                    `Price: ${price}\n` +
                    `Specs: ${specs}\n\n` +
                    `Let me know if you have any questions!\n\nBest regards,\nNextGen Realty`
                )
                break
            case 'follow_up':
                setSubject(`Following Up - ${address}`)
                setBody(
                    ownerGreeting +
                    `I wanted to follow up regarding the property at ${address}.\n\n` +
                    `Are you still interested in discussing options? I'd love to chat when you have a moment.\n\nBest regards,\nNextGen Realty`
                )
                break
            case 'offer_sent':
                setSubject(`Offer for ${address}`)
                setBody(
                    ownerGreeting +
                    `I appreciate you considering our offer on the property at ${address}.\n\n` +
                    `Please feel free to reach out if you have any questions. I'm happy to discuss the terms further.\n\nBest regards,\nNextGen Realty`
                )
                break
            default:
                // custom — clear for fresh start
                setSubject('')
                setBody('')
                setOfferAmount('')
                break
        }
    }

    const handleSend = async () => {
        if (!effectiveTo.trim()) {
            toast.error('Please enter a recipient email')
            return
        }
        // Basic email validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(effectiveTo.trim())) {
            toast.error('Please enter a valid email address')
            return
        }
        if (!subject.trim()) {
            toast.error('Please enter a subject')
            return
        }
        if (template === 'offer_sent' && (!offerAmount || isNaN(parseFloat(offerAmount)) || parseFloat(offerAmount) <= 0)) {
            toast.error('Please enter a valid offer amount')
            return
        }
        if (template === 'custom' && !body.trim()) {
            toast.error('Please enter a message body')
            return
        }

        setSending(true)

        let result
        const to = effectiveTo.trim()

        if (template === 'property_details') {
            result = await api.sendEmail(to, 'property_details', property.id, subject, undefined, replyTo)
        } else if (template === 'follow_up') {
            result = await api.sendEmail(to, 'follow_up', property.id, subject, undefined, replyTo, body)
        } else if (template === 'offer_sent') {
            const amount = parseFloat(offerAmount)
            // body is the additional notes / closing message
            result = await api.sendEmail(to, 'offer_sent', property.id, subject, undefined, replyTo, body, amount)
        } else {
            // custom — convert plain text body to HTML
            const htmlBody = body.replace(/\n/g, '<br>')
            result = await api.sendEmail(to, 'custom', property.id, subject, htmlBody, replyTo)
        }

        setSending(false)

        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success('Email sent successfully!')
            onClose()
            setSubject('')
            setBody('')
            setTemplate('custom')
            setOfferAmount('')
        }
    }

    // Dragging logic
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.target instanceof Element && (e.target.closest('button') || e.target.closest('input') || e.target.closest('select'))) return
        e.preventDefault()
        setIsDragging(true)
        dragStartRef.current = { x: e.clientX, y: e.clientY }
        startPosRef.current = { ...position }
    }

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return
            const dx = e.clientX - dragStartRef.current.x
            const dy = e.clientY - dragStartRef.current.y
            setPosition({ x: startPosRef.current.x + dx, y: startPosRef.current.y + dy })
        }
        const handleMouseUp = () => setIsDragging(false)

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', handleMouseUp)
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDragging])

    if (!isOpen) return null

    // Determine if we should show the dropdown (multiple known emails) or just a text input
    const hasMultipleEmails = allEmails.length > 1
    const showCustomInput = selectedTo === CUSTOM_ADDRESS_VALUE

    return (
        <div
            ref={windowRef}
            className={cn(
                "fixed z-[100] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-t-lg overflow-hidden flex flex-col transition-all duration-200 ease-out",
                isMinimized ? "h-12 w-72" : "h-[620px] w-[520px]"
            )}
            style={{
                bottom: '0px',
                right: '24px',
                transform: `translate(${position.x}px, ${position.y}px)`
            }}
        >
            {/* Header */}
            <div
                className={cn(
                    "flex items-center justify-between px-4 py-2.5 bg-zinc-900 text-white dark:bg-zinc-800 cursor-grab active:cursor-grabbing select-none",
                    isDragging && "cursor-grabbing"
                )}
                onMouseDown={handleMouseDown}
            >
                <div className="font-semibold text-sm flex items-center gap-2">
                    <span>New Message</span>
                    {property.address && (
                        <span className="text-zinc-400 font-normal text-xs truncate max-w-[200px]">
                            - {property.address}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-zinc-400 hover:text-white hover:bg-zinc-800"
                        onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized) }}
                    >
                        {isMinimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-zinc-400 hover:text-white hover:bg-zinc-800"
                        onClick={(e) => { e.stopPropagation(); onClose() }}
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* Body */}
            {!isMinimized && (
                <div className="flex-1 flex flex-col bg-white dark:bg-zinc-950 min-h-0">
                    {/* Metadata Fields */}
                    <div className="px-4 py-2 space-y-2 border-b border-zinc-100 dark:border-zinc-800">

                        {/* Template Selector */}
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-muted-foreground w-16 shrink-0">Template</span>
                            <Select value={template} onValueChange={handleTemplateChange}>
                                <SelectTrigger className="h-7 text-xs border-zinc-200 dark:border-zinc-800 w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {templates.map((t) => (
                                        <SelectItem key={t.value} value={t.value} className="text-xs">
                                            <div className="flex flex-col">
                                                <span className="font-medium">{t.label}</span>
                                                <span className="text-muted-foreground text-[11px]">{t.description}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Offer Amount — only shown for offer_sent template */}
                        {template === 'offer_sent' && (
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-medium text-muted-foreground w-16 shrink-0">Offer Amt</span>
                                <div className="flex-1 relative">
                                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input
                                        type="number"
                                        min="1"
                                        step="1000"
                                        value={offerAmount}
                                        onChange={(e) => setOfferAmount(e.target.value)}
                                        className="h-7 text-sm pl-7 border-zinc-200 dark:border-zinc-700"
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                        )}

                        {/* To field */}
                        <div className="flex items-start gap-3">
                            <span className="text-xs font-medium text-muted-foreground w-16 shrink-0 mt-1.5">To</span>
                            <div className="flex-1 space-y-1.5">
                                {hasMultipleEmails ? (
                                    <>
                                        <Select value={selectedTo} onValueChange={setSelectedTo}>
                                            <SelectTrigger className="h-7 text-xs border-zinc-200 dark:border-zinc-800 w-full">
                                                <SelectValue placeholder="Select email" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {allEmails.map((email) => (
                                                    <SelectItem key={email} value={email} className="text-xs font-mono">
                                                        {email}
                                                    </SelectItem>
                                                ))}
                                                <SelectItem value={CUSTOM_ADDRESS_VALUE} className="text-xs text-muted-foreground">
                                                    Custom address...
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {showCustomInput && (
                                            <Input
                                                type="email"
                                                value={customTo}
                                                onChange={(e) => setCustomTo(e.target.value)}
                                                className="h-7 text-sm border-zinc-200 dark:border-zinc-700"
                                                placeholder="Enter email address"
                                                autoFocus
                                            />
                                        )}
                                    </>
                                ) : (
                                    <Input
                                        type="email"
                                        value={effectiveTo}
                                        onChange={(e) => setSelectedTo(e.target.value)}
                                        className="h-7 text-sm shadow-none border-0 border-b border-transparent focus:border-zinc-300 focus-visible:ring-0 px-0 rounded-none bg-transparent"
                                        placeholder="Recipient"
                                    />
                                )}
                            </div>
                        </div>

                        {/* Subject */}
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-muted-foreground w-16 shrink-0">Subject</span>
                            <Input
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="h-7 text-sm shadow-none border-0 border-b border-transparent focus:border-zinc-300 focus-visible:ring-0 px-0 rounded-none bg-transparent font-medium"
                                placeholder="Subject"
                            />
                        </div>
                    </div>

                    {/* Body — label changes based on template */}
                    <Textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        className="flex-1 resize-none border-0 p-4 focus-visible:ring-0 text-sm font-sans leading-relaxed"
                        placeholder={
                            template === 'property_details'
                                ? 'Body preview (the actual email uses the branded template with full property details)...'
                                : template === 'offer_sent'
                                ? 'Additional notes / closing message (optional)...'
                                : 'Write your message here...'
                        }
                    />

                    {/* Template hint for property_details */}
                    {template === 'property_details' && (
                        <div className="px-4 py-2 bg-blue-50 dark:bg-blue-950/30 border-t border-blue-100 dark:border-blue-900">
                            <p className="text-[11px] text-blue-700 dark:text-blue-400">
                                The recipient will receive a branded email with the full property details automatically populated from the database.
                            </p>
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between p-3 border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0">
                        <div className="text-xs text-muted-foreground">
                            {effectiveTo && effectiveTo !== CUSTOM_ADDRESS_VALUE && (
                                <span className="font-mono">{effectiveTo}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onClose}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                Discard
                            </Button>
                            <Button
                                onClick={handleSend}
                                disabled={sending || !effectiveTo || effectiveTo === CUSTOM_ADDRESS_VALUE}
                                className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                            >
                                {sending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Sending
                                    </>
                                ) : (
                                    <>
                                        Send
                                        <Send className="ml-2 h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
