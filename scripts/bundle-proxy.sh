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

# Copy production dependencies from root node_modules
for pkg in $(node -e "const p = require('./${PROXY_SRC}/package.json'); console.log(Object.keys(p.dependencies||{}).join(' '))"); do
  if [ -d "node_modules/$pkg" ]; then
    cp -r "node_modules/$pkg" "$BUNDLE_DIR/node_modules/$pkg"
  fi
done

# Also copy keytar (native module)
if [ -d "node_modules/keytar" ]; then
  cp -r "node_modules/keytar" "$BUNDLE_DIR/node_modules/keytar"
fi

# Copy keytar's dependencies recursively
for dep in $(node -e "
  const seen = new Set();
  function deps(pkg) {
    try {
      const p = require('./node_modules/'+pkg+'/package.json');
      Object.keys(p.dependencies||{}).forEach(d => { if(!seen.has(d)) { seen.add(d); deps(d); }});
    } catch(e) {}
  }
  deps('keytar');
  console.log([...seen].join(' '));
" 2>/dev/null); do
  if [ -d "node_modules/$dep" ] && [ ! -d "$BUNDLE_DIR/node_modules/$dep" ]; then
    cp -r "node_modules/$dep" "$BUNDLE_DIR/node_modules/$dep"
  fi
done

# Copy regenerator-runtime and other critical deps
for pkg in regenerator-runtime tslib; do
  if [ -d "node_modules/$pkg" ] && [ ! -d "$BUNDLE_DIR/node_modules/$pkg" ]; then
    cp -r "node_modules/$pkg" "$BUNDLE_DIR/node_modules/$pkg"
  fi
done

echo ">>> Proxy bundle ready ($(du -sh $BUNDLE_DIR | cut -f1))"
