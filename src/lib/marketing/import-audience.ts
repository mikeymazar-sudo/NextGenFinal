import { createHash } from 'crypto'

export type MarketingImportAudienceContext = {
  importBatchId: string
  ownerUserId: string
  ownerTeamId: string | null
  ownerFullName: string | null
  listId: string | null
  listName: string | null
  importedAt: string
}

export type MarketingImportAudienceSignals = {
  uniquePhones: string[]
  uniqueEmails: string[]
}

export type MarketingImportAudienceMetadata = {
  importBatchId: string
  importedAt: string
  source: {
    type: 'csv_import'
    ownerUserId: string
    ownerTeamId: string | null
    ownerFullName: string | null
    leadListId: string | null
    leadListName: string | null
  }
  audience: {
    sourceType: 'csv_import' | 'lead_list'
    sourceId: string
    leadListId: string | null
    leadListName: string | null
    leadBacked: true
    campaignEligible: boolean
    eligibilityStatus: 'eligible' | 'missing_destination'
    eligibilityReason: string | null
    destinationChannels: Array<'sms' | 'email'>
    destinationCounts: {
      phoneCount: number
      emailCount: number
    }
    primaryDestination: {
      phone: string | null
      email: string | null
    }
    rowFingerprint: string
  }
}

function normalizeFingerprintValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() || ''
}

function buildRowFingerprint(row: Record<string, string | undefined>, signals: MarketingImportAudienceSignals) {
  const fingerprintSource = [
    row.address,
    row.city,
    row.state,
    row.zip,
    row.owner_name,
    row.owner_first_name,
    row.owner_last_name,
    ...signals.uniquePhones,
    ...signals.uniqueEmails,
  ]
    .map((value) => normalizeFingerprintValue(value))
    .join('|')

  return createHash('sha256').update(fingerprintSource).digest('hex')
}

export function buildMarketingImportAudienceMetadata(
  row: Record<string, string | undefined>,
  context: MarketingImportAudienceContext,
  signals: MarketingImportAudienceSignals
): MarketingImportAudienceMetadata {
  const hasUsableDestination = signals.uniquePhones.length > 0 || signals.uniqueEmails.length > 0
  const sourceType = context.listId ? 'lead_list' : 'csv_import'
  const sourceId = context.listId ?? context.importBatchId

  return {
    importBatchId: context.importBatchId,
    importedAt: context.importedAt,
    source: {
      type: 'csv_import',
      ownerUserId: context.ownerUserId,
      ownerTeamId: context.ownerTeamId,
      ownerFullName: context.ownerFullName,
      leadListId: context.listId,
      leadListName: context.listName,
    },
    audience: {
      sourceType,
      sourceId,
      leadListId: context.listId,
      leadListName: context.listName,
      leadBacked: true,
      campaignEligible: hasUsableDestination,
      eligibilityStatus: hasUsableDestination ? 'eligible' : 'missing_destination',
      eligibilityReason: hasUsableDestination
        ? null
        : 'No usable phone or email address was imported.',
      destinationChannels: (() => {
        const destinationChannels: Array<'sms' | 'email'> = []
        if (signals.uniquePhones.length > 0) {
          destinationChannels.push('sms')
        }
        if (signals.uniqueEmails.length > 0) {
          destinationChannels.push('email')
        }
        return destinationChannels
      })(),
      destinationCounts: {
        phoneCount: signals.uniquePhones.length,
        emailCount: signals.uniqueEmails.length,
      },
      primaryDestination: {
        phone: signals.uniquePhones[0] || null,
        email: signals.uniqueEmails[0] || null,
      },
      rowFingerprint: buildRowFingerprint(row, signals),
    },
  }
}
