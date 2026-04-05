export interface SignalWireEnv {
  apiToken: string | null
  fabricHost: string | null
  phoneNumber: string | null
  projectId: string | null
  spaceHost: string | null
  subscriberReference: string | null
}

function cleanSignalWireEnvValue(value: string | undefined) {
  if (!value) return null

  let cleaned = value.trim()

  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim()
  }

  return cleaned || null
}

export function getSignalWireFabricHost(spaceHost: string) {
  const baseHost = spaceHost
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .trim()

  if (!baseHost) {
    return null
  }

  const segments = baseHost.split('.').filter(Boolean)
  if (segments.length < 2) {
    return 'fabric.signalwire.com'
  }

  return `fabric.${segments.slice(1).join('.')}`
}

export function getSignalWireEnv(): SignalWireEnv {
  const apiToken = cleanSignalWireEnvValue(process.env.SIGNALWIRE_API_TOKEN)
  const phoneNumber = cleanSignalWireEnvValue(
    process.env.SIGNALWIRE_PHONE_NUMBER
  )
  const projectId = cleanSignalWireEnvValue(process.env.SIGNALWIRE_PROJECT_ID)
  const rawSpaceHost = cleanSignalWireEnvValue(process.env.SIGNALWIRE_SPACE_URL)
  const subscriberReference = cleanSignalWireEnvValue(
    process.env.SIGNALWIRE_SUBSCRIBER_REFERENCE
  )

  const spaceHost = rawSpaceHost
    ? rawSpaceHost.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
    : null
  const fabricHost = spaceHost ? getSignalWireFabricHost(spaceHost) : null

  return {
    apiToken,
    fabricHost,
    phoneNumber,
    projectId,
    spaceHost,
    subscriberReference,
  }
}
