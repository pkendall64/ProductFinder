# Product Finder Plan

## Goal

Build a static Product Finder application for ExpressLRS hardware that lets users apply filters and quickly find supported products that match their needs.

The Product Finder should follow the same general rebuild model as the flasher app in `../flasher`: when new hardware is published, regenerate the catalog and rebuild the site.

## What We Can Reuse From the Flasher

The existing flasher app already provides a useful pattern:

- Vue 3 + Vuetify single-page application structure
- Static asset publishing model
- Generated hardware metadata pulled from published artifacts
- Rebuild script approach for staying in sync with newly published hardware

What matters most here is the data pipeline, not the flasher stepper UI.

## Key Constraint

The current flasher hardware catalog in `targets.json` is not rich enough for a buyer-style product finder.

It provides fields such as:

- Vendor
- Product name
- TX/RX class
- Radio band (`2400`, `900`, `dual`)
- Firmware target
- Platform
- Upload methods
- Some features
- Minimum firmware version

It does **not** reliably provide the richer product attributes needed for filtering, such as:

- Output power
- Number of PWM outputs
- Internal vs external TX type
- Screen type (`TFT`, `OLED`, `none`)
- Diversity details
- Antenna connector types
- Voltage range
- Product images and links

Because of that, the Product Finder needs an additional enriched catalog layer.

## Recommended Architecture

Use a generated static JSON catalog that merges:

1. Published hardware metadata from the flasher artifacts
2. A manually maintained enrichment file for a small set of buyer-facing fields that cannot be derived reliably

Current implementation status:

- Local hardware artifact fetching is implemented
- Catalog generation is implemented
- A Vue 3 + Vuetify frontend prototype is implemented
- Vite is the local dev/build tool
- GitHub Pages deployment is implemented

Suggested flow:

1. Pull published hardware metadata
2. Normalize it into a stable internal product schema
3. Merge the referenced layout JSON with target `overlay` data
4. Merge with manual enrichment
5. Validate the merged catalog
6. Output a static `products.json` used by the frontend
7. Build and deploy the site

Implementation notes:

- The build now fetches hardware into `artifacts/firmware/hardware`
- The build no longer depends on the local `../flasher` directory layout
- `diy` vendor targets are excluded from the generated catalog
- Generic/DIY product entries are skipped
- Missing `catalog/enrichment.json` is treated as an empty enrichment source

## Catalog Model

### Fields derived from published metadata

- `vendor`
- `product_name`
- `device_type`
- `radio_band`
- `firmware_target`
- `platform`
- `min_power_value`
- `max_power_value`
- `pwm_outputs` when present in layout or overlay
- `screen_type` when present in layout or overlay
- `tx_type` derived from TX hardware wiring
- `diversity_type` normalized from target/layout metadata
- `device_class` normalized for the UI:
  - `receiver`
  - `transmitter_module`
  - `radio_handset`

### Enriched fields that will likely need manual maintenance

- `notes`
- `product_url`
- `image_url`
- `form_factor`

Implementation note:

- Everything else should be derived from the published target and hardware files where possible
- The build only accepts these enrichment fields and ignores any others
- Generated `products.json` is trimmed to the fields the frontend actually uses, plus allowed enrichment fields when present
- `product_url`
- `image_url`

## Recommended Filters

### Core filters already identified

- Output power
- PWM output count
- Product type
  - Receiver
  - Transmitter Module
  - Radio Handset
- External module screen type: `TFT`, `OLED`, `no screen`

### Additional useful filters

- Frequency band: `2.4GHz`, `900MHz`, `dual-band`
- Form factor
- Bay/module size: `Nano`, `Micro/JR`, full-size
- Diversity type
- Flash/update methods: WiFi, UART, Betaflight passthrough
- MCU/platform: `ESP8285`, `ESP32`, `ESP32-C3`, `ESP32-S3`
- Antenna connector type
- Fan present
- Voltage input range
- Receiver size class: nano, micro, full, AIO
- Vendor
- Firmware minimum version

## UX Direction

Do not reuse the flasher stepper UX directly.

Recommended UI:

- Filter panel on the left on desktop, top on mobile
- Search input for product/vendor name
- Chips, toggles, dropdowns, and sliders for filtering
- Results list or card grid
- Product card with the most important specs visible immediately
- Product detail drawer or detail page
- URL query params for sharable searches
- Optional compare mode for a small number of products

## Suggested Result Card Data

Each result should show:

- Vendor
- Product name
- Category
- Frequency band
- Output power
- PWM outputs
- Screen type
- Diversity type
- Flash/update methods
- Short notes or tags

## Build Pipeline Plan

### Phase 1: Data model and generation

- Define the normalized product schema
- Create a manual enrichment file
- Write a catalog generation script
- Download hardware artifacts locally
- Merge `targets.json`, referenced layout JSON, target `overlay`, and enrichment data
- Output `public/catalog/products.json`

Current status:

- Implemented
- PWM counts are derived from `pwm_outputs`
- Screen type is derived from hardware metadata
- Screenless external TX modules normalize to `none`
- TX type is derived from `serial_rx` and `serial_tx`
- Product type is normalized from RX/TX plus TX type
- Power range is derived from `power_min` and `power_max`
- Category is normalized to transmitter/receiver
- Diversity is derived from hardware metadata:
  - `radio_nss_2` key present -> `gemini`
  - `ant_ctrl` key present -> `antenna`
  - otherwise `single`
- ELRS power indexes are mapped to:
  - `10, 25, 50, 100, 250, 500, 1000, 2000 mW`
- `max_output_power_mw` remains useful where the marketed power is explicit in the product name

### Phase 2: Frontend MVP

- Build a Vue 3 frontend
- Load static catalog JSON
- Implement client-side filtering
- Support sharable filter state in the URL
- Render results and a basic product detail view

Current status:

- Initial Vue 3 + Vuetify prototype implemented
- Vite-based local development and production build flow implemented
- URL-backed filters implemented
- Results cards implemented
- Update method filter removed from the UI
- Product type now replaces separate category/TX-type filtering in the UI
- Diversity filter is presented explicitly as `Single`, `Antenna`, and `Gemini (True Diversity)`
- Desktop results pane uses an independently scrollable area with measured height updates tied to layout changes
- Global hero stats include a hover detail card with catalog breakdowns such as MCU, radio chip family, diversity, and selected special counts

### Phase 3: Validation and maintenance

- Add schema validation for the enrichment file
- Fail the build if new hardware appears without required enriched fields
- Add lightweight checks to avoid malformed catalog output

### Phase 4: Rebuild automation

- Reuse the flasher-style rebuild model
- Regenerate the catalog whenever new hardware is published
- Integrate into CI if desired

Current status:

- GitHub Actions workflow added for GitHub Pages deployment
- Workflow fetches hardware, builds the catalog, and deploys the static site

## Suggested Repository Structure

One possible structure:

```text
catalog/
  enrichment.json
scripts/
  build-catalog.js
  fetch_hardware.sh
artifacts/
  firmware/
    hardware/
public/
  catalog/
    products.json
app.js
index.html
styles.css
.github/
  workflows/
    deploy.yml
vite.config.js
PRODUCT_FINDER_PLAN.md
```

## MVP Recommendation

For the first version:

- Keep it as a static site
- Use Vue 3 for consistency with the flasher app
- Generate one merged `products.json`
- Start with these filters:
  - category
  - band
  - vendor
  - internal vs external
  - screen type
  - max power
  - PWM outputs
  - diversity
  - flash/update method

## Risks and Open Questions

- Many key product attributes do not exist in current published hardware metadata
- Some values may require manual curation and ongoing maintenance
- Product naming may be inconsistent, so normalization rules will matter
- We need to decide how strict the build should be when new hardware appears without enrichment data
- We may eventually want an upstream structured manifest instead of relying on local enrichment
- Some hardware-derived fields still need ELRS-specific interpretation rules, so extraction logic should stay conservative

## Recommended Next Step

Next step is to turn this plan into an implementation spec:

- exact file structure
- catalog schema
- example enrichment entries
- example generated product record
- MVP page/component breakdown
- build script responsibilities
