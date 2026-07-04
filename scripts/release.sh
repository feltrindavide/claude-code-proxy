#!/bin/bash
# Release script — builds the app, signs the update, creates release artifacts
# Usage: bash scripts/release.sh

set -e

APP_NAME="ClaudeCode Proxy"
VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([0-9.]*\)".*/\1/p' src-tauri/tauri.conf.json | head -1)
echo "=== Building $APP_NAME v$VERSION ==="

# 1. Build the app
echo ""
echo ">>> Building Tauri app..."
npm run tauri build

# 2. Sign the update (generates .sig + latest.json)
DMG="src-tauri/target/release/bundle/dmg/${APP_NAME}_${VERSION}_aarch64.dmg"
SIG_FILE="src-tauri/target/release/bundle/dmg/${APP_NAME}_${VERSION}_aarch64.dmg.sig"
LATEST_JSON="src-tauri/target/release/bundle/dmg/latest.json"

echo ""
echo ">>> Signing update..."
export TAURI_SIGNING_PRIVATE_KEY_PATH="$HOME/.tauri/ccp.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="ccp-update-key"
npx tauri signer sign -k "$TAURI_SIGNING_PRIVATE_KEY_PATH" -p "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD" "$DMG"

# 3. Generate latest.json
SIGNATURE=$(cat "$SIG_FILE")
echo ""
echo ">>> Generating latest.json..."
cat > "$LATEST_JSON" << EOF
{
  "version": "$VERSION",
  "notes": "See https://github.com/feltrindavide/claude-code-proxy/releases/tag/v$VERSION",
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platforms": {
    "darwin-aarch64": {
      "signature": "$SIGNATURE",
      "url": "https://github.com/feltrindavide/claude-code-proxy/releases/download/v$VERSION/${APP_NAME}_${VERSION}_aarch64.dmg"
    }
  }
}
EOF

echo ""
echo "=== Release artifacts ready ==="
echo "  DMG:        $DMG"
echo "  Signature:  $SIG_FILE"
echo "  Latest:     $LATEST_JSON"
echo ""
echo "To publish:"
echo "  1. git tag v$VERSION && git push origin v$VERSION"
echo "  2. Upload these files to GitHub Releases:"
echo "     - $DMG"
echo "     - $LATEST_JSON"
echo ""
