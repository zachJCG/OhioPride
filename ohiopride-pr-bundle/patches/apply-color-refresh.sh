#!/usr/bin/env bash
# Ohio Pride PAC — Brand v2.0 color refresh script
# Run from the repo root (the directory that contains index.html, css/, js/, etc).
set -euo pipefail

if [[ ! -f index.html || ! -d css ]]; then
  echo "ERROR: run this from the OhioPride repo root."
  exit 1
fi

# Files we touch: every .html, .css, .js, .toml, .md, .xml — but skip vendored dirs and old PR bundles.
SKIP_DIRS="ohiopride-pr-bundle|patches|OhioPride-Refocused|Update|oppr-fix|node_modules|.git"

mapfile -t FILES < <(find . -type f \
  \( -name "*.html" -o -name "*.css" -o -name "*.js" -o -name "*.mjs" -o -name "*.md" -o -name "*.xml" -o -name "*.toml" \) \
  | grep -Ev "/($SKIP_DIRS)/")

echo "Refreshing ${#FILES[@]} files…"

for f in "${FILES[@]}"; do
  # Old navy → new navy
  sed -i.bak -E 's/#0[fF]2233/#152233/g' "$f"
  # Old light blue → new light blue
  sed -i.bak -E 's/#73[dD]7[eE][eE]/#70D6EC/g' "$f"
  # Old Pride orange → new Pride orange
  sed -i.bak -E 's/#[fF][fF]8[cC]00/#FFBC00/g' "$f"
  # rgba light blue (old → new)
  sed -i.bak -E 's/rgba\(115, *215, *238/rgba(112, 214, 236/g' "$f"
  rm -f "$f.bak"
done

echo "Done. Review with: git diff --stat"
