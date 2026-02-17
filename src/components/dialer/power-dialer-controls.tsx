'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Pause,
  Play,
  Square,
  SkipForward,
  Loader2,
  MessageSquare,
  CheckCircle2,
  MapPin,
  User,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PowerDialerMode, PowerDialerLead, PowerDialerSessionStats } from '@/types/schema'

type TwilioCallState = 'idle' | 'connecting' | 'ringing' | 'live' | 'ended'

interface PowerDialerControlsProps {
  mode: PowerDialerMode
  currentLead: PowerDialerLead | null
  currentIndex: number
  totalLeads: number
  currentPhone: string | null
  dialAttempt: number
  smsStatus: string
  stats: PowerDialerSessionStats
  // Twilio state
  callState: TwilioCallState
  duration: number
  isMuted: boolean
  toggleMute: () => void
  hangUp: () => void
  deviceReady: boolean
  // Actions
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onSkip: () => void
  onContinue: () => void
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function PowerDialerControls({
  mode,
  currentLead,
  currentIndex,
  totalLeads,
  currentPhone,
  dialAttempt,
  smsStatus,
  stats,
  callState,
  duration,
  isMuted,
  toggleMute,
  hangUp,
  deviceReady,
  onPause,
  onResume,
  onStop,
  onSkip,
  onContinue,
}: PowerDialerControlsProps) {
  const progressPercent = totalLeads > 0 ? ((currentIndex) / totalLeads) * 100 : 0

  // ─── COMPLETED State ──────────────────────────────────────────
  if (mode === 'COMPLETED') {
    return (
      <div className="px-4 pb-4 space-y-3 animate-in fade-in duration-300">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-sm font-medium">Session Complete</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded bg-zinc-50 dark:bg-zinc-800/50 text-center">
            <p className="text-lg font-bold">{stats.total}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </div>
          <div className="p-2 rounded bg-green-50 dark:bg-green-950/30 text-center">
            <p className="text-lg font-bold text-green-600">{stats.interested}</p>
            <p className="text-[10px] text-muted-foreground">Interested</p>
          </div>
          <div className="p-2 rounded bg-zinc-50 dark:bg-zinc-800/50 text-center">
            <p className="text-lg font-bold">{stats.noAnswer}</p>
            <p className="text-[10px] text-muted-foreground">No Answer</p>
          </div>
          <div className="p-2 rounded bg-zinc-50 dark:bg-zinc-800/50 text-center">
            <p className="text-lg font-bold">{stats.skipped}</p>
            <p className="text-[10px] text-muted-foreground">Skipped</p>
          </div>
        </div>

        <Button variant="outline" size="sm" className="w-full" onClick={onStop}>
          Close
        </Button>
      </div>
    )
  }

  // ─── ACTIVE States ────────────────────────────────────────────
  return (
    <div className="px-4 pb-4 space-y-3 animate-in fade-in duration-200">
      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-amber-500" />
            <span className="text-xs font-medium">Power Dialer</span>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {Math.min(currentIndex + 1, totalLeads)}/{totalLeads}
          </span>
        </div>
        <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Current Lead Card */}
      {currentLead && (
        <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border space-y-1">
          {currentLead.ownerName && (
            <div className="flex items-center gap-1.5">
              <User className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-medium truncate">{currentLead.ownerName}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground truncate">
              {currentLead.address}{currentLead.city ? `, ${currentLead.city}` : ''}
            </span>
          </div>
          {currentPhone && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-mono text-muted-foreground">{currentPhone}</span>
            </div>
          )}
        </div>
      )}

      {/* Status Indicator */}
      <div className="flex items-center justify-center gap-2 h-6">
        {mode === 'LOADING_QUEUE' && (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
            <span className="text-xs text-muted-foreground">Loading leads...</span>
          </>
        )}
        {mode === 'SENDING_SMS' && (
          <>
            <MessageSquare className="h-3.5 w-3.5 text-blue-500 animate-pulse" />
            <span className="text-xs text-blue-600 dark:text-blue-400">
              {smsStatus === 'sent' ? 'SMS sent, calling...' : 'Sending SMS...'}
            </span>
          </>
        )}
        {mode === 'DIALING' && (
          <>
            <Phone className="h-3.5 w-3.5 text-green-500 animate-pulse" />
            <span className="text-xs text-green-600 dark:text-green-400">
              Calling{dialAttempt > 1 ? ' (attempt 2)' : ''}...
            </span>
          </>
        )}
        {mode === 'REDIALING' && (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
            <span className="text-xs text-amber-600 dark:text-amber-400">Redialing...</span>
          </>
        )}
        {mode === 'IN_CALL' && (
          <>
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-mono text-green-600 dark:text-green-400">
              Live {formatDuration(duration)}
            </span>
          </>
        )}
        {mode === 'SKIP_TRACING' && (
          <Badge variant="secondary" className="text-[10px]">
            No phone - skip trace needed
          </Badge>
        )}
        {mode === 'PAUSED' && (
          <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">
            Paused
          </Badge>
        )}
        {mode === 'PAUSED_AWAITING_CONTINUE' && (
          <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-600">
            Review lead — press Continue when ready
          </Badge>
        )}
        {mode === 'READY' && (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Processing...</span>
          </>
        )}
        {mode === 'DISPOSITION' && (
          <span className="text-xs text-muted-foreground">Saving notes...</span>
        )}
      </div>

      {/* Call Controls */}
      <div className="flex items-center justify-center gap-2">
        {/* Mute (during live call) */}
        {(mode === 'IN_CALL' || callState === 'ringing' || callState === 'live') && (
          <Button
            variant="outline"
            size="icon"
            className={cn(
              "h-9 w-9 rounded-full transition-colors",
              isMuted
                ? "bg-red-50 border-red-200 text-red-600 dark:bg-red-950/30"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
            )}
            onClick={toggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </Button>
        )}

        {/* Hangup (during call) */}
        {(mode === 'DIALING' || mode === 'REDIALING' || mode === 'IN_CALL') && (
          <Button
            size="icon"
            className="h-10 w-10 rounded-full bg-red-600 hover:bg-red-700 shadow-sm"
            onClick={hangUp}
          >
            {mode === 'DIALING' || mode === 'REDIALING' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PhoneOff className="h-4 w-4" />
            )}
          </Button>
        )}

        {/* Skip button */}
        {(mode === 'READY' || mode === 'PAUSED' || mode === 'SKIP_TRACING') && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={onSkip}
          >
            <SkipForward className="h-3 w-3" />
            Skip
          </Button>
        )}

        {/* Continue Dialing (after answered call) */}
        {mode === 'PAUSED_AWAITING_CONTINUE' && (
          <Button
            size="sm"
            className="h-8 gap-1 text-xs bg-green-600 hover:bg-green-700 text-white"
            onClick={onContinue}
          >
            <Play className="h-3 w-3" />
            Continue Dialing
          </Button>
        )}

        {/* Pause / Resume */}
        {mode !== 'LOADING_QUEUE' && mode !== 'DISPOSITION' && mode !== 'PAUSED_AWAITING_CONTINUE' && (
          mode === 'PAUSED' ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={onResume}
            >
              <Play className="h-3 w-3" />
              Resume
            </Button>
          ) : (mode === 'READY' || mode === 'SENDING_SMS') ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={onPause}
            >
              <Pause className="h-3 w-3" />
              Pause
            </Button>
          ) : null
        )}

        {/* Stop button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={onStop}
          title="Stop session"
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Quick stats row */}
      {(stats.called > 0 || stats.noAnswer > 0 || stats.skipped > 0) && (
        <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
          {stats.interested > 0 && <span className="text-green-600">{stats.interested} interested</span>}
          {stats.noAnswer > 0 && <span>{stats.noAnswer} no answer</span>}
          {stats.skipped > 0 && <span>{stats.skipped} skipped</span>}
        </div>
      )}
    </div>
  )
}
