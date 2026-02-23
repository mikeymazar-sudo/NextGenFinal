/**
 * Token estimation and text management utilities for AI analysis prompts.
 * Keeps prompt sizes reasonable to control API costs.
 */

/** Rough token estimate: ~4 chars per token for English text */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Truncate text to approximately maxTokens */
export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '...[truncated]'
}

/** Condense an SMS conversation into a compact summary format */
export function summarizeConversation(
  messages: Array<{ body: string; direction: string; created_at: string }>,
  maxTokens: number = 800
): string {
  if (!messages.length) return ''

  // Format as compact conversation
  const lines = messages.map((m) => {
    const prefix = m.direction === 'inbound' ? 'SELLER' : 'YOU'
    const date = new Date(m.created_at).toLocaleDateString()
    return `[${date}] ${prefix}: ${m.body}`
  })

  let result = lines.join('\n')

  // If too long, keep most recent messages
  if (estimateTokens(result) > maxTokens) {
    const kept: string[] = []
    let totalTokens = 0

    // Work backwards from most recent
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineTokens = estimateTokens(lines[i])
      if (totalTokens + lineTokens > maxTokens - 20) break
      kept.unshift(lines[i])
      totalTokens += lineTokens
    }

    if (kept.length < lines.length) {
      result = `[...${lines.length - kept.length} earlier messages omitted]\n${kept.join('\n')}`
    } else {
      result = kept.join('\n')
    }
  }

  return result
}

/** Condense call transcripts, keeping most relevant parts */
export function summarizeTranscripts(
  transcripts: Array<{ transcript: string; created_at: string; duration?: number | null }>,
  maxTokens: number = 1500
): string {
  if (!transcripts.length) return ''

  const sections: string[] = []
  const tokensPerTranscript = Math.floor(maxTokens / transcripts.length)

  for (const t of transcripts) {
    const date = new Date(t.created_at).toLocaleDateString()
    const dur = t.duration ? `${Math.ceil(t.duration / 60)}min` : ''
    const header = `--- Call ${date} ${dur} ---`
    const body = truncateToTokens(t.transcript, tokensPerTranscript - 10)
    sections.push(`${header}\n${body}`)
  }

  return sections.join('\n\n')
}

/** Condense notes into a compact format */
export function summarizeNotes(
  notes: Array<{ content: string; created_at: string }>,
  maxTokens: number = 500
): string {
  if (!notes.length) return ''

  const lines = notes.map((n) => {
    const date = new Date(n.created_at).toLocaleDateString()
    return `[${date}] ${n.content}`
  })

  let result = lines.join('\n')

  if (estimateTokens(result) > maxTokens) {
    const kept: string[] = []
    let totalTokens = 0
    for (const line of lines) {
      const lt = estimateTokens(line)
      if (totalTokens + lt > maxTokens - 10) break
      kept.push(line)
      totalTokens += lt
    }
    result = kept.join('\n')
    if (kept.length < lines.length) {
      result += `\n[...${lines.length - kept.length} more notes]`
    }
  }

  return result
}
