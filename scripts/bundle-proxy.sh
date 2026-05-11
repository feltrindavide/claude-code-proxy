#!/bin/bash
# Bundle proxy into a single file using esbuild
set -e

PROXY_SRC="packages/proxy"
BUNDLE_DIR="src-tauri/proxy-bundle"

echo ">>> Bundling proxy with esbuild..."
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR/dist"

npx esbuild "$PROXY_SRC/src/index.ts" \
  --bundle \
  --platform=node \
  --format=cjs \
  --target=node22 \
  --outfile="$BUNDLE_DIR/dist/index.cjs" \
  2>&1

# Package type
echo '{"type":"commonjs","name":"proxy-bundle"}' > "$BUNDLE_DIR/package.json"

echo ">>> Proxy bundle ready ($(du -sh $BUNDLE_DIR | cut -f1))"
ls -lh "$BUNDLE_DIR/dist/index.cjs"
