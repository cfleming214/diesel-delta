# Builds src/data/geo/zip3.json (3-digit ZIP prefix -> majority state) from the BSD-licensed
# `zipcodes` npm package data file (lib/codes.js). Reads it as JSON; does not execute it.
# Usage: npm pack zipcodes@8.0.0 && tar xzf zipcodes-8.0.0.tgz
#        python3 -I scripts/build-zip3.py package/lib/codes.js src/data/geo/zip3.json
import json, sys, collections
src, out = sys.argv[1], sys.argv[2]
text = open(src).read().strip()
assert text.startswith('exports.codes = ')
body = text[len('exports.codes = '):].split(';\nexports.', 1)[0]
codes = json.loads(body)
by3 = collections.defaultdict(collections.Counter)
for z, rec in codes.items():
    if rec.get('country') != 'US' or len(z) != 5 or not z.isdigit():
        continue
    by3[z[:3]][rec['state']] += 1
table, mixed = {}, []
for p in sorted(by3):
    c = by3[p]
    st, n = c.most_common(1)[0]
    table[p] = st
    if len(c) > 1:
        mixed.append((p, dict(c)))
json.dump(table, open(out, 'w'), separators=(',', ':'), sort_keys=True)
print('zips', sum(sum(c.values()) for c in by3.values()), 'prefixes', len(table), 'mixed', len(mixed))
for m in mixed[:40]:
    print(m)
print('states', sorted(set(table.values())))
