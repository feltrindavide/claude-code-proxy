#!/bin/bash
# Post-build signing and repackaging
# Re-signs the .app with --deep to seal resources, then recreates .dmg and .tar.gz
# Usage: bash scripts/sign-and-package.sh

set -e

APP_NAME="ClaudeCode Proxy"
VERSION=$(node -e "console.log(require('./src-tauri/tauri.conf.json').version)")
APP="src-tauri/target/release/bundle/macos/${APP_NAME}.app"
DMG="src-tauri/target/release/bundle/dmg/${APP_NAME}_${VERSION}_aarch64.dmg"
TARGZ="src-tauri/target/release/bundle/macos/${APP_NAME}.app.tar.gz"
SIG_FILE="src-tauri/target/release/bundle/macos/${APP_NAME}.app.tar.gz.sig"

echo "=== Post-build: Re-signing ${APP_NAME} v${VERSION} ==="

# 1. Re-sign with --deep to seal resources
echo ">>> Re-signing with --deep..."
codesign --force --deep --sign - --preserve-metadata=entitlements,identifier,flags "$APP"

# Verify
echo ">>> Verification:"
codesign -dvv "$APP" 2>&1 | grep -E "Sealed Resources|Signature|Identifier|TeamIdentifier" || true

# 2. Re-create .dmg from re-signed .app
echo ">>> Re-creating .dmg..."
# Remove old DMG if exists
rm -f "$DMG"

# Create temporary DMG directory structure
DMG_DIR=$(mktemp -d)
DMG_NAME="${APP_NAME}_${VERSION}_aarch64"
DMG_VOLUME="${APP_NAME}"

# Copy app to temp dir
cp -R "$APP" "$DMG_DIR/"

# Create symlink to Applications
ln -s /Applications "$DMG_DIR/Applications"

# Create DMG
hdiutil create -volname "$DMG_VOLUME" -srcfolder "$DMG_DIR" -ov -format UDZO "$DMG" 2>&1

# Clean up
rm -rf "$DMG_DIR"

echo ">>> .dmg created: $(du -h "$DMG" | cut -f1)"

# 3. Re-create .tar.gz for updater
echo ">>> Re-creating .tar.gz..."
rm -f "$TARGZ"
(cd "src-tauri/target/release/bundle/macos/" && tar czf "$(basename "$TARGZ")" "${APP_NAME}.app")
echo ">>> .tar.gz created: $(du -h "$TARGZ" | cut -f1)"

# 4. Re-sign the .tar.gz for updater
echo ">>> Re-signing updater artifact..."
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/ccp-v2.key)" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
npx tauri signer sign "$TARGZ" 2>&1
echo ">>> .sig created: $(du -h "$SIG_FILE" | cut -f1)"

echo ""
echo "=== Done ==="
echo "  App (re-signed):    $APP"
echo "  DMG (recreated):    $DMG"
echo "  Targz (recreated):  $TARGZ"
echo "  Sig (re-signed):    $SIG_FILE"
