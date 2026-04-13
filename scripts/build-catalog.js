import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const hardwareRoot = path.join(rootDir, 'artifacts/firmware/hardware')
const sourcePath = path.join(hardwareRoot, 'targets.json')
const enrichmentPath = path.join(rootDir, 'catalog/enrichment.json')
const outputPath = path.join(rootDir, 'public/catalog/products.json')
const allowedEnrichmentFields = new Set(['notes', 'product_url', 'image_url', 'form_factor'])

if (!exists(sourcePath)) {
  console.error(`Missing hardware catalog at ${sourcePath}`)
  console.error('Run `npm run fetch:hardware` before building the catalog.')
  process.exit(1)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readOptionalJson(filePath, fallback) {
  if (!exists(filePath)) return fallback
  return readJson(filePath)
}

function sanitizeEnrichment(entry) {
  const sanitized = {}
  for (const [key, value] of Object.entries(entry || {})) {
    if (allowedEnrichmentFields.has(key)) sanitized[key] = value
  }
  return sanitized
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true})
}

function exists(filePath) {
  return fs.existsSync(filePath)
}

function radioBand(radioKey) {
  if (radioKey.endsWith('_2400')) return '2400'
  if (radioKey.endsWith('_900')) return '900'
  if (radioKey.endsWith('_dual')) return 'dual'
  return 'unknown'
}

function categoryFromRadioKey(radioKey) {
  if (radioKey.startsWith('tx')) return 'tx'
  return 'rx'
}

function detectTxType(category, hardware) {
  if (category !== 'tx') return null
  if (!Number.isInteger(hardware.serial_rx) || !Number.isInteger(hardware.serial_tx)) return null
  if (hardware.serial_rx === hardware.serial_tx) return 'external'
  return 'internal'
}

function deviceClass(category, txType) {
  if (category === 'rx') return 'receiver'
  if (txType === 'external') return 'transmitter_module'
  if (txType === 'internal') return 'radio_handset'
  return 'transmitter_module'
}

function inferScreenType(config, productName) {
  if (/oled/i.test(productName)) return 'oled'
  if (/tft/i.test(productName) || /_tft\./i.test(config.logo_file || '')) return 'tft'
  return null
}

function inferPwm(productName) {
  const channels = productName.match(/(\d+)\s*ch/i)
  if (channels) return Number(channels[1])
  return null
}

function inferDiversity(hardware) {
  if (Object.prototype.hasOwnProperty.call(hardware, 'radio_nss_2')) return 'gemini'
  if (Object.prototype.hasOwnProperty.call(hardware, 'ant_ctrl')) return 'antenna'
  return 'single'
}

function layoutFolder(category) {
  return category === 'tx' ? 'TX' : 'RX'
}

function readLayoutFile(layoutFile, category) {
  if (!layoutFile) return {}
  const layoutPath = path.join(hardwareRoot, layoutFolder(category), layoutFile)
  if (!exists(layoutPath)) return {}
  return readJson(layoutPath)
}

function mergeHardware(layout, overlay) {
  return {
    ...layout,
    ...(overlay || {}),
  }
}

function screenTypeLabel(screenType) {
  if (screenType === 1) return 'oled'
  if (screenType === 4) return 'tft'
  return null
}

function normalizedScreenType(category, txType, hardwareScreenType, inferredScreenType) {
  const detected = hardwareScreenType || inferredScreenType
  if (detected) return detected
  if (category === 'tx' && txType === 'external') return 'none'
  return null
}

const powerLevelsMw = [10, 25, 50, 100, 250, 500, 1000, 2000]

function numericPowerRange(hardware) {
  if (!Number.isInteger(hardware.power_min) && !Number.isInteger(hardware.power_max)) {
    return {min: null, max: null}
  }
  const minIndex = Number.isInteger(hardware.power_min) ? hardware.power_min : 0
  const maxIndex = Number.isInteger(hardware.power_max) ? hardware.power_max : powerLevelsMw.length - 1
  const min = powerLevelsMw[Math.max(0, Math.min(minIndex, powerLevelsMw.length - 1))]
  const max = powerLevelsMw[Math.max(0, Math.min(maxIndex, powerLevelsMw.length - 1))]
  return {min, max}
}

function outputPowerFromName(productName) {
  const watts = productName.match(/(\d+(?:\.\d+)?)\s*w/i)
  if (watts) return Math.round(Number(watts[1]) * 1000)
  const milliwatts = productName.match(/(\d+)\s*mw/i)
  if (milliwatts) return Number(milliwatts[1])
  return null
}

function pwmCount(hardware, productName) {
  if (Array.isArray(hardware.pwm_outputs)) return hardware.pwm_outputs.length
  return inferPwm(productName)
}

function bandLabel(band) {
  return {
    '2400': '2.4GHz',
    '900': '900MHz',
    dual: 'Dual-band',
    unknown: 'Unknown',
  }[band]
}

function productId(vendor, radioKey, target) {
  return `${vendor}:${radioKey}:${target}`
}

function mergeTags(config, record) {
  return [...new Set([...(config.features || []), config.platform, record.band_label, record.category])]
}

const hardware = readJson(sourcePath)
const enrichment = readOptionalJson(enrichmentPath, {defaults: {}, products: {}})
const defaults = sanitizeEnrichment(enrichment.defaults || {})
const enrichedProducts = Object.fromEntries(
  Object.entries(enrichment.products || {}).map(([productId, entry]) => [productId, sanitizeEnrichment(entry)]),
)

const products = []

for (const [vendor, vendorEntry] of Object.entries(hardware)) {
  if (['diy', 'generic'].includes(vendor)) continue
  for (const [radioKey, targetMap] of Object.entries(vendorEntry)) {
    if (radioKey === 'name') continue
    for (const [target, config] of Object.entries(targetMap)) {
      if (/^(generic|diy)\b/i.test(config.product_name)) continue
      const id = productId(vendor, radioKey, target)
      const category = categoryFromRadioKey(radioKey)
      const band = radioBand(radioKey)
      const layout = readLayoutFile(config.layout_file, category)
      const mergedHardware = mergeHardware(layout, config.overlay)
      const powerRange = numericPowerRange(mergedHardware)
      const txType = detectTxType(category, mergedHardware)
      const classification = deviceClass(category, txType)
      const baseRecord = {
        id,
        vendor,
        vendor_name: vendorEntry.name || vendor,
        target,
        radio_key: radioKey,
        product_name: config.product_name,
        category,
        device_class: classification,
        radio_band: band,
        band_label: bandLabel(band),
        firmware_target: config.firmware,
        platform: config.platform,
        upload_methods: config.upload_methods || [],
        features: config.features || [],
        min_version: config.min_version,
        layout_file: config.layout_file || null,
        logo_file: config.logo_file || null,
        tx_type: txType,
        screen_type: normalizedScreenType(
          category,
          txType,
          screenTypeLabel(mergedHardware.screen_type),
          inferScreenType(config, config.product_name),
        ),
        min_power_value: powerRange.min,
        max_power_value: powerRange.max,
        max_output_power_mw: outputPowerFromName(config.product_name),
        pwm_outputs: pwmCount(mergedHardware, config.product_name),
        diversity_type: inferDiversity(mergedHardware),
        tags: [],
        notes: '',
        status: 'active',
      }

      const merged = {
        ...baseRecord,
        ...defaults,
        ...(enrichedProducts[id] || {}),
      }
      merged.tags = mergeTags(config, merged)
      products.push(merged)
    }
  }
}

products.sort((left, right) => {
  return left.vendor_name.localeCompare(right.vendor_name) || left.product_name.localeCompare(right.product_name)
})

ensureDir(outputPath)
fs.writeFileSync(outputPath, `${JSON.stringify(products, null, 2)}\n`)

const coverage = {
  total: products.length,
  withPower: products.filter((product) => product.max_power_value != null || product.max_output_power_mw != null).length,
  withPwm: products.filter((product) => product.pwm_outputs != null).length,
  withScreen: products.filter((product) => product.screen_type != null).length,
  externalTx: products.filter((product) => product.tx_type === 'external').length,
}

console.log(`Wrote ${products.length} products to ${path.relative(rootDir, outputPath)}`)
console.log(JSON.stringify(coverage, null, 2))
