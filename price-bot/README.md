# Price bot

The separate service that collects daily prices for the canonical catalog. The design is in `../PRICE_BOT_PLAN.md`.

## Catalog

`catalog/items.csv` holds the 150 item specs. `catalog.ts` loads and validates it, and `npm run bot:test` checks it.

| Column | Meaning |
| --- | --- |
| `id` | Stable item ID. The 22 IDs from the app's fixtures are kept, so saved baskets and follows survive. |
| `name`, `category` | Display name, and one of the 11 categories in `catalog.ts`. |
| `size_qty`, `size_unit` | Target size. Units: `oz`, `lb`, `fl_oz`, `gal`, `qt`, `l`, `ml`, `ct`, `roll`, `each`, `sq_ft`. |
| `priced_by` | `package`, `lb` (sold by weight; size must be 1 lb) or `each` (by the piece; size must be 1 each). |
| `size_tolerance` | Allowed size difference when matching a retailer product, from 0 to 0.25. |
| `brand_policy`, `brand` | `national` pins `brand`. `cheapest_comparable` allows store brands. |
| `ref_price` | An approximate U.S. shelf price. Only the mock retailers and the first validation bands use it. |
| `bls_series_id` | BLS Average Price series for cross-checks. These are from memory and are unverified until the BLS adapter fetches them (P6). |
| `in_default_basket` | `1` for the app's default basket. |

Retailer GTINs and SKUs are not in the catalog. They are matched per retailer, reviewed, and stored in `item_identifiers`.
