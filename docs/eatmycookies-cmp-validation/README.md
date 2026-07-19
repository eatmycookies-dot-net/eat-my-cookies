# Eat My Cookies CMP Validation Pack

Generated as a starting corpus for live browser validation.

## Files

- `test-sites.md` — consolidated test matrix.
- `vendors/onetrust.md` — OneTrust fingerprints and targets.
- `vendors/sourcepoint.md` — Sourcepoint fingerprints and targets.
- `vendors/didomi.md` — Didomi fingerprints and targets.
- `vendors/trustarc.md` — TrustArc fingerprints and targets.
- `vendors/consentmanager.md` — ConsentManager fingerprints and targets.
- `vendors/iubenda.md` — Iubenda fingerprints and targets.
- `vendors/appconsent.md` — AppConsent fingerprints and targets.
- `vendors/custom.md` — custom and hybrid implementations.

## Corpus size

| Family | Targets |
|---|---:|
| OneTrust | 80 |
| Sourcepoint | 49 |
| Didomi | 30 |
| TrustArc | 24 |
| ConsentManager | 30 |
| Iubenda | 20 |
| AppConsent | 15 |
| Custom and Hybrid Implementations | 50 |

## Important limitation

The assignments are deliberately labeled by evidence status. They must be confirmed with a live browser before being encoded as permanent automated expectations. Static lists of CMP customers become stale quickly, and the same domain can serve different consent systems by geography or product surface.

## Recommended result fields

`observed_at`, `region`, `url`, `vendor_detected`, `fingerprint_id`, `banner_present`, `reject_result`, `accept_result`, `custom_result`, `persistence_result`, `iframe_origins`, `script_urls`, `cookies_written`, `notes`, `screenshot_path`.