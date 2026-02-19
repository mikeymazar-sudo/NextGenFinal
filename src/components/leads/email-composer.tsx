'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Minus, Maximize2, Send, Loader2, GripHorizontal } from 'lucide-react'
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

const templates: { value: TemplateType; label: string }[] = [
    { value: 'custom', label: 'Select a template...' },
    { value: 'property_details', label: 'Property Details' },
    { value: 'follow_up', label: 'Follow Up' },
    { value: 'offer_sent', label: 'Offer Sent' },
]

export function EmailComposer({ isOpen, onClose, initialTo, property }: EmailComposerProps) {
    const [isMinimized, setIsMinimized] = useState(false)
    const [to, setTo] = useState(initialTo)
    const [subject, setSubject] = useState('')
    const [body, setBody] = useState('')
    const [template, setTemplate] = useState<TemplateType>('custom')
    const [sending, setSending] = useState(false)

    // Dragging state
    const [position, setPosition] = useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const dragStartRef = useRef({ x: 0, y: 0 })
    const startPosRef = useRef({ x: 0, y: 0 })
    const windowRef = useRef<HTMLDivElement>(null)

    // Update "To" when initialTo changes
    useEffect(() => {
        setTo(initialTo)
    }, [initialTo])

    // Reset when opened
    useEffect(() => {
        if (isOpen) {
            if (!isMinimized) {
                // Only reset position if fully reopening, or keep it?
                // Let's keep position to be nice, but ensure it's on screen if possible.
                // Actually simplest is just reset if it was closed.
            }
        }
    }, [isOpen])

    const handleTemplateChange = (value: string) => {
        const newVal = value as TemplateType
        setTemplate(newVal)

        if (newVal === 'custom') return

        // Generate content based on template
        const address = property.address
        const fullAddress = [property.address, property.city, property.state, property.zip].filter(Boolean).join(', ')
        const price = property.price ? `$${Number(property.price).toLocaleString()}` : 'Price TBD'
        const specs = `${property.bedrooms || '?'} beds, ${property.bathrooms || '?'} baths, ${property.sqft ? Number(property.sqft).toLocaleString() : '?'} sqft`

        // Sender context - using generic for now as we don't have user name in props
        const signOff = '\n\nBest regards,\nNextGen Realty'

        switch (newVal) {
            case 'property_details':
                setSubject(`Property Details: ${address}`)
                setBody(
                    `Hi ${property.ownerName || 'there'},\n\n` +
                    `Here are the details for the property we discussed:\n\n` +
                    `Property: ${fullAddress}\n` +
                    `Price: ${price}\n` +
                    `Specs: ${specs}\n\n` +
                    `Let me know if you have any questions!` +
                    signOff
                )
                break
            case 'follow_up':
                setSubject(`Following Up - ${address}`)
                setBody(
                    `Hi ${property.ownerName || 'there'},\n\n` +
                    `I wanted to follow up regarding the property at ${address}.\n\n` +
                    `Are you still interested in discussing options? I'd love to chat when you have a moment.` +
                    signOff
                )
                break
            case 'offer_sent':
                setSubject(`Offer for ${address}`)
                setBody(
                    `Hi ${property.ownerName || 'there'},\n\n` +
                    `Thank you for considering our offer on the property at ${address}.\n\n` +
                    `Please review the details and let me know if you have any questions.` +
                    signOff
                )
                break
        }
    }

    const handleSend = async () => {
        if (!to.trim()) {
            toast.error('Please enter a recipient')
            return
        }
        if (!subject.trim()) {
            toast.error('Please enter a subject')
            return
        }
        if (!body.trim()) {
            toast.error('Please enter a message body')
            return
        }

        setSending(true)

        // We send as 'custom' template with customHtml since the user edited the body
        // Converting newlines to <br> for simple HTML formatting
        const htmlBody = body.replace(/\n/g, '<br>')

        const result = await api.sendEmail(
            to,
            'custom',
            property.id,
            subject,
            htmlBody
        )

        setSending(false)

        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success('Email sent successfully!')
            onClose()
            // Reset form
            setSubject('')
            setBody('')
            setTemplate('custom')
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

            // Calculate new position
            // Negative X moves left, positive right
            // Negative Y moves up, positive down
            // Since we use translate(), 0,0 is the initial fixed position (bottom-right)

            setPosition({
                x: startPosRef.current.x + dx,
                y: startPosRef.current.y + dy
            })
        }

        const handleMouseUp = () => {
            setIsDragging(false)
        }

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

    return (
        <div
            ref={windowRef}
            className={cn(
                "fixed z-[100] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-t-lg overflow-hidden flex flex-col transition-all duration-200 ease-out",
                isMinimized ? "h-12 w-72" : "h-[600px] w-[500px]"
            )}
            style={{
                bottom: '0px',
                right: '24px', // Standard Gmail-like positioning
                transform: `translate(${position.x}px, ${position.y}px)`
            }}
        >
            {/* Header */}
            <div
                className={cn(
                    "flex items-center justify-between px-4 py-2.5 bg-zinc-900 text-white dark:bg-zinc-800 cursor-grab active:cursor-grabbing",
                    isDragging && "cursor-grabbing"
                )}
                onMouseDown={handleMouseDown}
            >
                <div className="font-semibold text-sm flex items-center gap-2">
                    <span>New Message</span>
                    {property.address && (
                        <span className="text-zinc-400 font-normal text-xs truncate max-w-[200px]">- {property.address}</span>
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
                <div className="flex-1 flex flex-col bg-white dark:bg-zinc-950">
                    {/* Metadata Fields */}
                    <div className="px-4 py-2 space-y-2 border-b border-zinc-100 dark:border-zinc-900">
                        {/* Template Selector - Put first for workflow */}
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-muted-foreground w-12">Template</span>
                            <div className="flex-1">
                                <Select value={template} onValueChange={handleTemplateChange}>
                                    <SelectTrigger className="h-7 text-xs border-zinc-200 dark:border-zinc-800 w-full">
                                        <SelectValue placeholder="Latest template" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {templates.map((t) => (
                                            <SelectItem key={t.value} value={t.value} className="text-xs">
                                                {t.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-muted-foreground w-12">To</span>
                            <Input
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                className="h-7 text-sm shadow-none border-0 border-b border-transparent focus:border-zinc-300 focus-visible:ring-0 px-0 rounded-none bg-transparent"
                                placeholder="Recipient"
                            />
                        </div>

                        <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-muted-foreground w-12">Subject</span>
                            <Input
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="h-7 text-sm shadow-none border-0 border-b border-transparent focus:border-zinc-300 focus-visible:ring-0 px-0 rounded-none bg-transparent font-medium"
                                placeholder="Subject"
                            />
                        </div>
                    </div>

                    {/* Body */}
                    <Textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        className="flex-1 resize-none border-0 p-4 focus-visible:ring-0 text-base font-sans leading-relaxed"
                        placeholder="Write your message here..."
                    />

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between p-3 border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/50">
                        <div className="text-xs text-muted-foreground">
                            {/* Bottom left content */}
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
                                disabled={sending || !to}
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
