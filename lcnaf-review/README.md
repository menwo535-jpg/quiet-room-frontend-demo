# Authority Review interface prototype

This is a new, self-contained replacement demonstration prepared on 7 November 2026 after an earlier prototype attachment was rejected by Gmail. It is not represented as a byte-for-byte copy of that attachment.

Open the hosted `index.html`, or download the file and open it directly in a current browser. It has no dependencies and makes no application network requests. For local HTTP testing: `python -m http.server 4935 --bind 127.0.0.1` from this directory.

Try loading fictional examples, correcting an incomplete record, approving/rejecting records, filtering the list, and exporting approved records. UTF-8 CSV and JSON imports accept `id`, `label`, `aliases`, `description`, `possibleMatch`. Separate CSV aliases with `|`. Imports are bounded to 2 MB / 1,000 records per file. Duplicate IDs are skipped; editing an approved record returns it to pending.

All bundled records and matches are fictional. ID format validation does not establish that an authority exists. Supplied possible matches are not independently verified. Inputs remain in memory and are cleared on refresh. CSV export prefixes formula-like fields with an apostrophe for spreadsheet safety; JSON preserves their literal values.

This demonstrates an interface workflow. It does not retrieve Library of Congress data, match or write live Wikidata records, or integrate with OpenRefine. It is not the completed LCNAF2Wiki project. See `VALIDATION.txt` for actually executed checks and remaining limitations.
