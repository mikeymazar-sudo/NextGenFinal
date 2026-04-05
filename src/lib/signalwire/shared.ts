export interface SignalWireAddress {
  id: string
  name: string
  display_name?: string | null
  locked?: boolean
  resource_id?: string
  type?: string
  channels?: {
    audio?: string
    messaging?: string
    video?: string
  }
}

function normalizePhoneKey(value: string) {
  return value.replace(/\D/g, '')
}

function getAudioChannelKey(address: SignalWireAddress) {
  const audioChannel = address.channels?.audio
  if (!audioChannel) return ''

  const pathWithoutQuery = audioChannel.split('?')[0] || ''
  const pathSegments = pathWithoutQuery.split('/').filter(Boolean)
  return pathSegments[pathSegments.length - 1] || ''
}

export function isSignalWireExternalAudioAddress(address: SignalWireAddress) {
  return Boolean(address.channels?.audio?.startsWith('/external/'))
}

export function pickSignalWireExternalAudioAddressId(
  addresses: SignalWireAddress[]
) {
  return (
    addresses.find(
      (address) =>
        !address.locked &&
        isSignalWireExternalAudioAddress(address) &&
        address.channels?.audio
    )?.id ?? null
  )
}

export function findSignalWireOutboundAddressId(
  addresses: SignalWireAddress[],
  phoneNumber: string
) {
  const outboundAddresses = addresses.filter(
    (address) =>
      !address.locked &&
      isSignalWireExternalAudioAddress(address) &&
      address.channels?.audio
  )

  if (!outboundAddresses.length) {
    return null
  }

  const targetPhoneKey = normalizePhoneKey(phoneNumber)
  const exactMatch = targetPhoneKey
    ? outboundAddresses.find((address) => {
        const candidates = [
          address.display_name || '',
          address.name,
          getAudioChannelKey(address),
        ]

        return candidates.some(
          (candidate) => normalizePhoneKey(candidate) === targetPhoneKey
        )
      })
    : null

  if (exactMatch) {
    return exactMatch.id
  }

  return outboundAddresses.length === 1 ? outboundAddresses[0].id : null
}
