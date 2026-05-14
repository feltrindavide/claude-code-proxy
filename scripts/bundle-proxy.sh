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
  --loader:.wasm=copy \
  2>&1

# Copy tiktoken WASM binary (esbuild copies it to dist/ but it needs to be alongside)
# With --loader:.wasm=copy, esbuild places tiktoken_bg.wasm next to the output
# We also ensure a fallback copy in the dist dir for tiktoken's runtime resolution
if [ -f "node_modules/tiktoken/tiktoken_bg.wasm" ]; then
  cp node_modules/tiktoken/tiktoken_bg.wasm "$BUNDLE_DIR/dist/"
  echo ">>> tiktoken WASM copied to dist/"
fi

# Copy frontend static files into the bundle
WEB_OUT="apps/web/out"
if [ -d "$WEB_OUT" ]; then
  echo ">>> Copying frontend static files..."
  cp -r "$WEB_OUT" "$BUNDLE_DIR/web"
  echo ">>> Frontend copied ($(du -sh $BUNDLE_DIR/web | cut -f1))"
else
  echo ">>> WARNING: Frontend build not found at $WEB_OUT. Run 'npm run build' first."
fi

# Copy plugin files into bundle (auto-installed by proxy on startup)
PLUGIN_DIR="$BUNDLE_DIR/plugins/proxy-context"
mkdir -p "$PLUGIN_DIR"
cp scripts/plugins/proxy-context/SKILL.md "$PLUGIN_DIR/"
cp scripts/context-status.js "$BUNDLE_DIR/plugins/"
cp scripts/auto-compact-hook.js "$BUNDLE_DIR/plugins/"
echo ">>> Plugin files copied ($(du -sh $PLUGIN_DIR | cut -f1))"

# Package type with version from Tauri config
VERSION=$(node -e "console.log(require('./src-tauri/tauri.conf.json').version || '0.1.0')")
echo "{\"type\":\"commonjs\",\"name\":\"proxy-bundle\",\"version\":\"$VERSION\"}" > "$BUNDLE_DIR/package.json"
echo ">>> Bundle version: $VERSION"

echo ">>> Proxy bundle ready ($(du -sh $BUNDLE_DIR | cut -f1))"
ls -lh "$BUNDLE_DIR/dist/index.cjs"
