import { icons as lucide } from '@iconify-json/lucide'
import { icons as simpleIcons } from '@iconify-json/simple-icons'

// Icon-name catalog backing the IconPicker component. Names only — no SVG
// bodies — so the payload stays small; the client renders glyphs through
// <UIcon>, which resolves them via @nuxt/icon. Only collections the host
// installs are listed, so every name offered here is guaranteed renderable.
// Aliases are skipped (they duplicate their targets in a browse UI).
const CATALOG = {
  collections: [
    { prefix: 'lucide', names: Object.keys(lucide.icons) },
    { prefix: 'simple-icons', names: Object.keys(simpleIcons.icons) }
  ]
}

export default defineEventHandler((event) => {
  requireAuth(event)
  return CATALOG
})
