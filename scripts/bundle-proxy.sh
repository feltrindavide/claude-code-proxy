#!/bin/bash
# Bundle proxy for production — creates standalone proxy with all deps
set -e

PROXY_SRC="packages/proxy"
BUNDLE_DIR="src-tauri/proxy-bundle"

echo ">>> Building proxy..."
cd "$PROXY_SRC"
npx tsc --outDir dist
cd ../..

echo ">>> Creating proxy bundle..."
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR/dist"
mkdir -p "$BUNDLE_DIR/node_modules"

# Copy dist and package.json
cp -r "$PROXY_SRC/dist/"* "$BUNDLE_DIR/dist/"
cp "$PROXY_SRC/package.json" "$BUNDLE_DIR/"

# Read dependencies from package.json using node
DEPS=$(node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('${PROXY_SRC}/package.json', 'utf-8'));
  console.log(Object.keys(p.dependencies || {}).join(' '));
")

echo ">>> Copying dependencies: $DEPS"

for pkg in $DEPS; do
  # Find the package in node_modules (might be hoisted to root)
  SRC=""
  for dir in "$PROXY_SRC/node_modules/$pkg" "node_modules/$pkg"; do
    if [ -d "$dir" ]; then
      SRC="$dir"
      break
    fi
  done
  
  if [ -n "$SRC" ]; then
    echo "  Copying $pkg..."
    cp -r "$SRC" "$BUNDLE_DIR/node_modules/$pkg"
  else
    echo "  WARNING: $pkg not found in node_modules!"
  fi
done

# Remove .bin (not needed) and prune
rm -rf "$BUNDLE_DIR/node_modules/.bin" 2>/dev/null

echo ">>> Proxy bundle ready ($(du -sh $BUNDLE_DIR | cut -f1))"
