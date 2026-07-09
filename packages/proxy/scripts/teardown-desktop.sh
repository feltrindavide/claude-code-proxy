#!/usr/bin/env bash
# Teardown Claude Code Proxy desktop integration (pf + launchctl env).
# Run with: sudo ~/.claude/claude-code-proxy/scripts/teardown-desktop.sh

set -euo pipefail

HOME_DIR="${HOME:-$(eval echo ~$(whoami))}"
PROXY_DIR="${HOME_DIR}/.claude/claude-code-proxy"
ANCHOR="${PROXY_DIR}/data/certs/api.anthropic.com.pem"

echo "[teardown] Removing pf anchor and redirect rules..."
if [ -f /etc/pf.anchors/claudecode-proxy ]; then
  rm -f /etc/pf.anchors/claudecode-proxy
fi
if grep -q 'claudecode-proxy' /etc/pf.conf 2>/dev/null; then
  sed -i '' '/claudecode-proxy/d' /etc/pf.conf || true
  pfctl -f /etc/pf.conf 2>/dev/null || true
fi

echo "[teardown] Removing launchctl environment overrides..."
launchctl unsetenv ANTHROPIC_BASE_URL 2>/dev/null || true
launchctl unsetenv ANTHROPIC_API_KEY 2>/dev/null || true

if [ -f "${ANCHOR}" ]; then
  echo "[teardown] Removing trusted cert (may require Keychain Access)..."
  security delete-certificate -c "api.anthropic.com" /Library/Keychains/System.keychain 2>/dev/null || true
fi

echo "[teardown] Done."
