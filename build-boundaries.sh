#!/usr/bin/env bash
# Rebuilds data/countries-ne50m.geojson from Natural Earth 1:50m admin-0 countries (public domain).
# Needs: curl, python3, node (npx mapshaper).
set -euo pipefail
mkdir -p src data && cd src
curl -sL -o ne_50m.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
python3 - <<'PY'
import json
d = json.load(open('ne_50m.geojson'))
for f in d['features']:
    q = f['properties']
    # NE quirk: ISO_A3 is -99 for France, Norway, Kosovo, N. Cyprus, Somaliland ... -> use ISO_A3_EH, then ADM0_A3
    iso = q['ISO_A3_EH'] if q['ISO_A3_EH'] != '-99' else q['ADM0_A3']
    if q['ADM0_A3'] == 'KOS': iso = 'XKX'   # common user-assigned code for Kosovo
    f['properties'] = {'iso_a3': iso, 'name': q['NAME_EN'] or q['NAME'], 'admin': q['ADMIN'], 'continent': q['CONTINENT']}
json.dump(d, open('ne_50m_clean.geojson', 'w'))
PY
# one feature per ISO code (merges e.g. Australia + Ashmore/Cartier + Indian Ocean Territories), simplify, 2-decimal coords
npx -y mapshaper ne_50m_clean.geojson -dissolve iso_a3 copy-fields=name,admin,continent \
  -simplify 20% keep-shapes -clean -o format=geojson precision=0.01 id-field=iso_a3 ../data/countries-ne50m.geojson
ls -lh ../data/countries-ne50m.geojson
