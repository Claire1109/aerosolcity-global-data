# Core catalog maintenance

The D041 catalog is authoritative for active canonical products and their explicit variants. Six stable themes are defined in taxonomy.json. Original record objects are kept losslessly inside active variants; full exited records remain in the controller baseline backup. Public archives retain identity, reason, source, original file objects, licenses and proof references without being counted in core searches.

Reviewed intake is mandatory before changing records. Preserve stable legacy IDs and deterministic migration targets. A merged legacy ID resolves to one exact variant. Do not infer mergers from equal titles. Source-family or mixed-version declarations remain clearly identified and cannot prove a specific release, grid or file.

All search constraints and dimensional filters must match one variant simultaneously. CSV exports one row per matching variant, with canonical product ID, matched variant metadata and separate original-family year reference. Rows, variants, variables and product totals are different grains. File entrance counts deduplicate exact href or explicit canonical file identity; all historical asset objects remain preserved even when references repeat.

Do not delete, move, rewrite or re-hash scientific/proof files for UI work. Compare their pinned Git object IDs. Preserve source/local/hosted year distinctions, units, missingness, licenses and request ceilings. Metadata listing, header/sample and full-file evidence are distinct from local acquisition and site hosting.

Run `node --test tests/core.test.cjs tests/data.test.cjs` and the controlled browser checks in work/WEB/D041_core. UI checks must block source/scientific GETs. tests/baseline.json remains the historical93-ID/43-asset fixture; legacy-record-fingerprints.json binds exact active originals and archived backup identities. New intake must not update historical preservation fixtures to hide drift.

Build and source-review evidence are maintained by WEB in its task directory. A reviewed exact candidate and controller release gate are required before a normal fast-forward push to the original main branch. No force push, new scientific upload, backend, permission change or paid service is needed.
