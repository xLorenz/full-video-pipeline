#!/usr/bin/env bash
# Offline font fallback for Remotion projects.
#
# Use when Google Fonts is unreachable (restricted sandbox, locked-down CI).
# Fonts come from npm (@fontsource-variable/*), which these environments usually allow.
#
# Run from the ROOT of the Remotion project:
#   bash <skill>/scripts/setup_offline_fonts.sh
# Then replace the Google loader:
#   cp src/design/fonts.offline.ts src/design/fonts.ts
set -euo pipefail

if [ ! -f package.json ]; then
  echo "error: run this from the root of a Remotion project (no package.json here)" >&2
  exit 1
fi

# @remotion/* packages must all share the exact version of `remotion`.
V=$(node -p "(require('./package.json').dependencies||{}).remotion || ''" | sed 's/^[\^~]//')
if [ -z "$V" ]; then
  echo "error: 'remotion' is not in package.json dependencies" >&2
  exit 1
fi

echo "Installing fonts (remotion $V)..."
npm install --save-exact --no-audit --no-fund \
  "@remotion/fonts@$V" \
  @fontsource-variable/inter-tight @fontsource-variable/inter @fontsource-variable/jetbrains-mono

mkdir -p public/fonts
cp node_modules/@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2 public/fonts/inter-tight.woff2
cp node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2 public/fonts/inter.woff2
cp node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2 public/fonts/jetbrains-mono.woff2

echo "Done. Fonts are in public/fonts/."
echo "Next: cp src/design/fonts.offline.ts src/design/fonts.ts"
echo "To use other families, install @fontsource-variable/<name> (or @fontsource/<name>) and copy its latin woff2 the same way."
