# Static catalog maintenance

`data/catalog.json` is the authoritative source. The D039 redesign preserves its exact bytes; human-indicators.json remains a separate historical indicator view and is not added to product counts.

For a future approved intake:
1. Update the authoritative product and approved file records without changing existing stable IDs or binary paths.
2. Read every new product name, variable, temporal/spatial scope and access evidence. Add one primary path and any justified secondary paths to product-taxonomy.json. Unknown semantics belong in the internal unclassified list; these records remain in all/search.
3. Use the seven stable theme IDs; add only real nonempty subthemes. Secondary employment and sector-emission paths must not imply facilities or production. Keep product-specific acronyms in product metadata, not shared category aliases.
4. Add a reviewed normalized-facets row. Preserve explicit years, range, qualifier and unknowns. A declared range is not a list of complete acquired annual files. Preserve original cadence and spatial descriptions. Never convert angular grids to a fixed global metre scale.
5. Normalize formats only from declared native formats or approved explicit format evidence. Preserve unknowns; URL extension alone is insufficient. Keep access method separate from content-verification status.
6. Run `node --test tests/*.test.cjs`, serve this directory locally, and run the controlled browser checks recorded in work/WEB/D039_redesign. Scientific/download requests must be intercepted during UI tests.
7. For an authorized product intake, deliberately refresh tests/baseline.json after reviewing all identity and asset changes. UI-only changes must retain its catalog fingerprint unchanged.
8. Commit a reviewed independent branch. D039 itself does not authorize push, merge or deployment.

Routes use hash navigation. Historical #top, #catalog and #product-ID links are compatible. All browsed paths share one #/datasets/ID detail. CSV export quotes every field and neutralizes spreadsheet formula prefixes. No external fonts, backend or new dependency is required.
