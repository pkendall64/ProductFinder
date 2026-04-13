<script setup>
import {computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch} from 'vue'

const defaults = {
  search: '',
  classification: '',
  band: '',
  vendor: '',
  screen: '',
  diversity: '',
  minPower: '',
  minPwm: '',
}

const filters = reactive({...defaults})
const resultsPanel = ref(null)
const resultsScroll = ref(null)
const resultsScrollHeight = ref(null)
const catalog = reactive({
  items: [],
  loaded: false,
  error: '',
})
let resultsResizeObserver = null
let heightUpdateFrame = null

const selectLabels = {
  classification: 'Any product type',
  band: 'Any band',
  vendor: 'Any vendor',
  screen: 'Any screen',
  diversity: 'Any diversity',
  minPower: 'No minimum power',
  minPwm: 'No minimum PWM',
}

function titleCase(value) {
  return String(value)
    .split(/[_-]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function queryState() {
  const params = new URLSearchParams(window.location.search)
  return {
    search: params.get('search') || '',
    classification: params.get('classification') || '',
    band: params.get('band') || '',
    vendor: params.get('vendor') || '',
    screen: params.get('screen') || '',
    diversity: params.get('diversity') || '',
    minPower: params.get('min-power') || '',
    minPwm: params.get('min-pwm') || '',
  }
}

function writeQuery() {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.classification) params.set('classification', filters.classification)
  if (filters.band) params.set('band', filters.band)
  if (filters.vendor) params.set('vendor', filters.vendor)
  if (filters.screen) params.set('screen', filters.screen)
  if (filters.diversity) params.set('diversity', filters.diversity)
  if (filters.minPower) params.set('min-power', filters.minPower)
  if (filters.minPwm) params.set('min-pwm', filters.minPwm)
  const query = params.toString()
  const next = `${window.location.pathname}${query ? `?${query}` : ''}`
  window.history.replaceState({}, '', next)
}

function matchesThreshold(actual, threshold) {
  if (!threshold) return true
  if (actual == null) return false
  return Number(actual) >= Number(threshold)
}

function matchesProduct(product) {
  const text = [
    product.vendor_name,
    product.product_name,
    product.notes,
    ...(product.tags || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (filters.search && !text.includes(filters.search.toLowerCase())) return false
  if (filters.classification && product.device_class !== filters.classification) return false
  if (filters.band && product.radio_band !== filters.band) return false
  if (filters.vendor && product.vendor !== filters.vendor) return false
  if (filters.screen) {
    if (product.device_class !== 'transmitter_module') return false
    if (filters.screen === 'none') {
      if (product.screen_type && product.screen_type !== 'none') return false
    } else if (product.screen_type !== filters.screen) {
      return false
    }
  }
  if (filters.diversity && product.diversity_type !== filters.diversity) return false
  if (!matchesThreshold(product.max_power_value ?? product.max_output_power_mw, filters.minPower)) return false
  if (!matchesThreshold(product.pwm_outputs, filters.minPwm)) return false
  return true
}

function uniqueValues(key) {
  return [...new Set(catalog.items.map((item) => item[key]).filter(Boolean))].sort()
}

function selectItems(key, formatter = titleCase, labelKey = key) {
  return [
    {title: selectLabels[labelKey], value: ''},
    ...uniqueValues(key).map((value) => ({title: formatter(value), value})),
  ]
}

function powerDisplay(product) {
  if (product.min_power_value != null && product.max_power_value != null) {
    return product.min_power_value === product.max_power_value
      ? `${product.max_power_value} mW`
      : `${product.min_power_value}-${product.max_power_value} mW`
  }
  if (product.max_output_power_mw != null) return `${product.max_output_power_mw} mW`
  return 'Unknown'
}

function screenLabel(value) {
  return {
    none: 'None',
    oled: 'OLED',
    tft: 'TFT',
  }[value] || titleCase(value)
}

function cardSpecs(product) {
  const specs = []

  const power = powerDisplay(product)
  if (power !== 'Unknown') specs.push(['Power', power])

  if (product.diversity_type) {
    specs.push(['Diversity', diversityLabel(product.diversity_type)])
  }

  if (product.category === 'tx') {
    specs.unshift(['Band', bandLabel(product.radio_band)])
    if (product.screen_type && product.screen_type !== 'none') {
      specs.push(['Screen', screenLabel(product.screen_type)])
    }
    return specs
  }

  if (product.pwm_outputs != null) specs.splice(1, 0, ['PWM', product.pwm_outputs])
  return specs
}

function clearFilters() {
  Object.assign(filters, defaults)
}

function clearFilter(key) {
  filters[key] = defaults[key]
}

function updateResultsScrollHeight() {
  if (!resultsScroll.value || window.innerWidth <= 960) {
    resultsScrollHeight.value = null
    return
  }

  const rect = resultsScroll.value.getBoundingClientRect()
  const available = Math.floor(window.innerHeight - rect.top - 24)
  resultsScrollHeight.value = Math.max(240, available)
}

function scheduleResultsScrollHeightUpdate() {
  if (heightUpdateFrame != null) cancelAnimationFrame(heightUpdateFrame)
  heightUpdateFrame = requestAnimationFrame(() => {
    heightUpdateFrame = null
    updateResultsScrollHeight()
  })
}

function bandLabel(value) {
  return {
    '2400': '2.4GHz',
    '900': '900MHz',
    dual: 'Dual-band',
  }[value] || value
}

function vendorLabel(vendor) {
  const match = catalog.items.find((item) => item.vendor === vendor)
  return match?.vendor_name || titleCase(vendor)
}

function categoryLabel(value) {
  return {
    receiver: 'Receiver',
    transmitter_module: 'Transmitter Module',
    radio_handset: 'Radio Handset',
  }[value] || titleCase(value)
}

function badgeLabel(value) {
  return {
    receiver: 'Receiver',
    transmitter_module: 'Module',
    radio_handset: 'Radio',
  }[value] || titleCase(value)
}

function diversityLabel(value) {
  return value === 'gemini' ? 'Gemini (True Diversity)' : titleCase(value)
}

function countBy(items, valueFn) {
  const counts = new Map()
  items.forEach((item) => {
    const value = valueFn(item)
    if (!value) return
    counts.set(value, (counts.get(value) || 0) + 1)
  })
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .map(([label, count]) => ({label, count}))
}

function radioChipLabel(product) {
  if (product.firmware_target?.includes('LR1121')) return 'LR1121'
  if (product.radio_band === '2400') return 'SX1280'
  if (product.radio_band === '900') return 'SX127x'
  return null
}

const categoryItems = computed(() => selectItems('device_class', categoryLabel, 'classification'))
const bandItems = computed(() => selectItems('radio_band', bandLabel, 'band'))
const vendorItems = computed(() => [
  {title: selectLabels.vendor, value: ''},
  ...[...new Set(catalog.items.map((item) => item.vendor).filter(Boolean))]
    .sort()
    .map((vendor) => ({title: vendorLabel(vendor), value: vendor})),
])
const screenItems = computed(() => [
  {title: selectLabels.screen, value: ''},
  {title: screenLabel('none'), value: 'none'},
  {title: 'OLED', value: 'oled'},
  {title: 'TFT', value: 'tft'},
])
const diversityItems = computed(() => [
  {title: selectLabels.diversity, value: ''},
  {title: diversityLabel('single'), value: 'single'},
  {title: diversityLabel('antenna'), value: 'antenna'},
  {title: diversityLabel('gemini'), value: 'gemini'},
])
const minPowerItems = computed(() => [
  {title: selectLabels.minPower, value: ''},
  ...[...new Set(catalog.items.map((item) => item.max_power_value ?? item.max_output_power_mw).filter(Boolean))]
    .sort((a, b) => a - b)
    .map((value) => ({title: `${value} mW`, value})),
])
const minPwmItems = computed(() => [
  {title: selectLabels.minPwm, value: ''},
  ...[...new Set(catalog.items.map((item) => item.pwm_outputs).filter(Boolean))]
    .sort((a, b) => a - b)
    .map((value) => ({title: String(value), value})),
])

const filteredProducts = computed(() => catalog.items.filter(matchesProduct))
const vendorCount = computed(() => new Set(catalog.items.map((item) => item.vendor)).size)
const receiverCount = computed(() => catalog.items.filter((item) => item.device_class === 'receiver').length)
const moduleCount = computed(() => catalog.items.filter((item) => item.device_class === 'transmitter_module').length)
const radioCount = computed(() => catalog.items.filter((item) => item.device_class === 'radio_handset').length)
const mcuStats = computed(() => countBy(catalog.items, (item) => item.platform?.toUpperCase()))
const radioChipStats = computed(() => countBy(catalog.items, radioChipLabel))
const pwmRxCount = computed(() => catalog.items.filter((item) => item.device_class === 'receiver' && item.pwm_outputs != null).length)
const diversityStats = computed(() => countBy(catalog.items, (item) => item.diversity_type ? diversityLabel(item.diversity_type) : null))
const disablePwmFilter = computed(() => ['transmitter_module', 'radio_handset'].includes(filters.classification))
const disableScreenFilter = computed(() => ['receiver', 'radio_handset'].includes(filters.classification))
const activeFilters = computed(() => {
  const entries = [
    {key: 'search', label: 'Search', value: filters.search},
    {key: 'classification', label: 'Product Type', value: filters.classification && categoryLabel(filters.classification)},
    {key: 'band', label: 'Band', value: filters.band && bandLabel(filters.band)},
    {key: 'vendor', label: 'Vendor', value: filters.vendor && vendorLabel(filters.vendor)},
    {key: 'screen', label: 'Screen', value: filters.screen && screenLabel(filters.screen)},
    {key: 'diversity', label: 'Diversity', value: filters.diversity && diversityLabel(filters.diversity)},
    {key: 'minPower', label: 'Min Power', value: filters.minPower && `${filters.minPower} mW`},
    {key: 'minPwm', label: 'Min PWM', value: filters.minPwm},
  ]
  return entries.filter((entry) => entry.value)
})
const hasActiveFilters = computed(() => activeFilters.value.length > 0)

watch(filters, writeQuery, {deep: true})
watch(filters, async () => {
  await nextTick()
  scheduleResultsScrollHeightUpdate()
}, {deep: true})

watch(disablePwmFilter, (disabled) => {
  if (disabled) filters.minPwm = ''
})

watch(disableScreenFilter, (disabled) => {
  if (disabled) filters.screen = ''
})

onMounted(() => {
  Object.assign(filters, queryState())
  window.addEventListener('resize', scheduleResultsScrollHeightUpdate)
  fetch('./catalog/products.json')
    .then((response) => {
      if (!response.ok) throw new Error('Unable to load product catalog')
      return response.json()
    })
    .then((items) => {
      catalog.items = items
      catalog.loaded = true
      nextTick(scheduleResultsScrollHeightUpdate)
    })
    .catch(() => {
      catalog.error = 'Unable to load product catalog'
      nextTick(scheduleResultsScrollHeightUpdate)
    })

  if (typeof ResizeObserver !== 'undefined' && resultsPanel.value) {
    resultsResizeObserver = new ResizeObserver(() => {
      scheduleResultsScrollHeightUpdate()
    })
    resultsResizeObserver.observe(resultsPanel.value.$el || resultsPanel.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleResultsScrollHeightUpdate)
  resultsResizeObserver?.disconnect()
  if (heightUpdateFrame != null) cancelAnimationFrame(heightUpdateFrame)
})
</script>

<template>
  <VApp>
    <VMain class="app-main">
      <div class="page-shell">
        <section class="hero">
          <div class="hero-copy">
            <h1>ExpressLRS Product Finder</h1>
            <p class="hero-text">
              All products listed here have been tested and approved by your friendly ExpressLRS dev team!
            </p>
          </div>
          <VHover v-if="catalog.loaded && !catalog.error">
            <template #default="{ isHovering, props }">
              <div class="hero-stats-wrap" v-bind="props">
                <div class="hero-stats">
                  <strong>{{ catalog.items.length }} Products</strong>
                  <span>{{ vendorCount }} Manufacturers</span>
                </div>
                <VExpandTransition>
                  <div v-if="isHovering" class="hero-stats-popover">
                    <p class="stats-popover-title">Interesting Stats</p>
                    <div class="stats-section">
                      <p class="stats-title">Device Types</p>
                      <div class="stats-chips">
                        <VChip size="small" variant="outlined" rounded="xl">
                          Receivers <span class="chip-count">{{ receiverCount }}</span>
                        </VChip>
                        <VChip size="small" variant="outlined" rounded="xl">
                          Modules <span class="chip-count">{{ moduleCount }}</span>
                        </VChip>
                        <VChip size="small" variant="outlined" rounded="xl">
                          Radios <span class="chip-count">{{ radioCount }}</span>
                        </VChip>
                        <VChip size="small" variant="outlined" rounded="xl">
                          PWM RXes <span class="chip-count">{{ pwmRxCount }}</span>
                        </VChip>
                      </div>
                    </div>
                    <div class="stats-section">
                      <p class="stats-title">MCUs</p>
                      <div class="stats-chips">
                        <VChip
                          v-for="item in mcuStats"
                          :key="`mcu-${item.label}`"
                          size="small"
                          variant="outlined"
                          rounded="xl"
                        >
                          {{ item.label }} <span class="chip-count">{{ item.count }}</span>
                        </VChip>
                      </div>
                    </div>
                    <div class="stats-section">
                      <p class="stats-title">Radio Chips</p>
                      <div class="stats-chips">
                        <VChip
                          v-for="item in radioChipStats"
                          :key="`radio-${item.label}`"
                          size="small"
                          variant="outlined"
                          rounded="xl"
                        >
                          {{ item.label }} <span class="chip-count">{{ item.count }}</span>
                        </VChip>
                      </div>
                    </div>
                    <div class="stats-section">
                      <p class="stats-title">Diversity</p>
                      <div class="stats-chips">
                        <VChip
                          v-for="item in diversityStats"
                          :key="`div-${item.label}`"
                          size="small"
                          variant="outlined"
                          rounded="xl"
                        >
                          {{ item.label }} <span class="chip-count">{{ item.count }}</span>
                        </VChip>
                      </div>
                    </div>
                  </div>
                </VExpandTransition>
              </div>
            </template>
          </VHover>
        </section>

        <div class="layout">
          <VCard class="filters-panel" variant="flat">
            <div class="panel-header">
              <div>
                <h2>Filters</h2>
              </div>
              <VBtn variant="outlined" color="primary" @click="clearFilters">Reset</VBtn>
            </div>

            <div class="filter-grid">
              <VTextField v-model="filters.search" label="Search" placeholder="Vendor, product" hide-details />
              <VSelect v-model="filters.vendor" :items="vendorItems" label="Vendor" hide-details />
              <VSelect v-model="filters.classification" :items="categoryItems" label="Product Type" hide-details />
              <VSelect v-model="filters.band" :items="bandItems" label="Band" hide-details />
              <VSelect v-model="filters.minPower" :items="minPowerItems" label="Minimum Power" hide-details />
              <VSelect v-model="filters.diversity" :items="diversityItems" label="Diversity" hide-details />
              <VSelect
                v-model="filters.minPwm"
                :items="minPwmItems"
                label="Minimum PWM"
                :disabled="disablePwmFilter"
                hide-details
              />
              <VSelect
                v-model="filters.screen"
                :items="screenItems"
                label="Screen"
                :disabled="disableScreenFilter"
                hide-details
              />
            </div>
          </VCard>

          <VCard ref="resultsPanel" class="results-panel" variant="flat">
            <div class="results-header">
              <div>
                <h2>Results</h2>
                <p id="results-summary">
                  <span v-if="catalog.error">{{ catalog.error }}</span>
                  <span v-else-if="catalog.loaded && !hasActiveFilters">
                    &nbsp;
                  </span>
                  <span v-else-if="catalog.loaded">
                    {{ filteredProducts.length }} of {{ catalog.items.length }} products match the current filters.
                  </span>
                  <span v-else>Loading catalog...</span>
                </p>
              </div>
            </div>

            <div v-if="activeFilters.length" class="active-filters">
              <VChip
                v-for="filter in activeFilters"
                :key="filter.key"
                class="filter-chip"
                color="secondary"
                variant="tonal"
                rounded="xl"
                closable
                @click:close="clearFilter(filter.key)"
              >
                {{ filter.label }}: {{ filter.value }}
              </VChip>
            </div>

            <div
              ref="resultsScroll"
              class="results-scroll"
              :style="resultsScrollHeight ? {maxHeight: `${resultsScrollHeight}px`} : undefined"
            >
              <div v-if="catalog.error" class="empty-state">
                Catalog failed to load.
              </div>
              <div v-else-if="catalog.loaded && !hasActiveFilters" class="empty-state">
                Search by vendor or product name, or apply filters like product type, band, diversity, power, PWM, or
                screen to find supported ExpressLRS hardware.
              </div>
              <div v-else-if="catalog.loaded && !filteredProducts.length" class="empty-state">
                No products matched the current filter set.
              </div>
              <div v-else class="results-grid">
                <VCard
                  v-for="product in filteredProducts"
                  :key="product.id"
                  class="product-card"
                  :class="product.device_class === 'receiver' ? 'product-card-rx' : 'product-card-tx'"
                  variant="flat"
                >
                  <div class="product-card-header">
                    <div>
                      <p class="product-vendor">{{ product.vendor_name }}</p>
                      <h3 class="product-name">{{ product.product_name }}</h3>
                    </div>
                    <VChip class="product-category" color="primary" variant="tonal" rounded="xl">
                      {{ badgeLabel(product.device_class) }}
                    </VChip>
                  </div>
                  <div class="product-specs">
                    <div
                      v-for="[label, value] in cardSpecs(product)"
                      :key="`${product.id}-${label}`"
                      class="pill"
                    >
                      <span>{{ label }}</span>
                      <strong>{{ value }}</strong>
                    </div>
                  </div>
                </VCard>
              </div>
            </div>
          </VCard>
        </div>
      </div>
    </VMain>
  </VApp>
</template>
