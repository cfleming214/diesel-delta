# Diesel Data brand assets

The mark is a shopping cart with a price line rising out of the basket. Source design: the "Diesel Data logo, app icon and branding" canvas (option 11, cart + price line).

| File | Use |
|---|---|
| `diesel-data-mark.svg` | Mark on dark backgrounds |
| `diesel-data-mark-light.svg` | Mark on light backgrounds |
| `diesel-data-mark-mono.svg` | One-color (white) mark, Android themed icon |
| `diesel-data-mark-small.svg` | Simplified mark for 48 px and below |
| `diesel-data-logo.svg`, `diesel-data-logo-light.svg` | Mark + wordmark (Inter Bold). The PNGs in `png/` have the font baked in |
| `diesel-data-app-icon.svg` | 1024×1024 iOS icon master |

Colors: cart `#3fbf73`, price line `#9fe0b5`, ground `#0e1d16` (icon glow `#1f4430` → `#163322` → `#0e1d16`), text `#e8f1ea`. On light: cart `#1f7a46`, line `#2b9a58`, ground `#f1f6ef`.

`npm run brand:render` rebuilds `assets/images/` (icon, Android adaptive layers, splash, favicon) and `png/` from these SVGs.
