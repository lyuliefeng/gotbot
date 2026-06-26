function splitKeys(value) {
  return String(value || '')
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function unique(items) {
  return Array.from(new Set(items))
}

function platformImageKeys() {
  return unique([
    ...splitKeys(process.env.PLATFORM_IMAGE_API_KEYS),
    ...splitKeys(process.env.PLATFORM_IMAGE_API_KEY),
  ])
}

function platformTextKeys() {
  const textKeys = splitKeys(process.env.PLATFORM_TEXT_API_KEYS)
  const legacyTextKey = splitKeys(process.env.PLATFORM_TEXT_API_KEY)
  return unique([
    ...textKeys,
    ...legacyTextKey,
    ...platformImageKeys(),
  ])
}

function pickPlatformKey(keys) {
  if (!keys.length) return ''
  return keys[Math.floor(Math.random() * keys.length)]
}

function pickPlatformImageKey() {
  return pickPlatformKey(platformImageKeys())
}

function pickPlatformTextKey() {
  return pickPlatformKey(platformTextKeys())
}

module.exports = { platformImageKeys, platformTextKeys, pickPlatformImageKey, pickPlatformTextKey }
