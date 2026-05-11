# Setup Guide

Step-by-step instructions to install and configure Claude Code Proxy.

## Prerequisites

- **Node.js 18+** — Runtime for the proxy server
- **macOS** — Required for Keychain API key storage
- **Claude Code** — The CLI tool that will route through the proxy
- **Rust/Cargo** — Required only if building the Tauri desktop app from source

## Step 1: Install Dependencies

Navigate to the project root and install workspace dependencies:

```bash
npm install
```

This installs all packages in the monorepo workspace (proxy, CLI, web app).

## Step 2: Run Setup Script

The enhanced setup script automates Claude Code configuration:

```bash
npm run setup
```

The setup script performs the following:

1. **Configures ANTHROPIC_BASE_URL** — Writes `export ANTHROPIC_BASE_URL="http://localhost:3456"` to your shell profile (`.zshenv` for zsh, `.bashrc` for bash, or fish config)
2. **Creates default config.json** — Generates `~/.claude-code-proxy/config.json` with default model mappings
3. **Verifies provider connections** — Checks connectivity for any configured providers (if proxy is running)
4. **Imports backup config** — Optionally imports settings from a previous backup
5. **Configures Keychain** — Prompts for API keys and stores them securely in macOS Keychain
6. **Generates diagnostic report** — Prints a summary of your configuration

### Setup Script Flags

```bash
npm run setup -- --dry-run          # Preview changes without applying them
npm run setup -- --import backup.json  # Import from a backup file
npm run setup -- --non-interactive  # Skip all interactive prompts
npm run setup -- --no-keychain      # Skip Keychain configuration
```

After running setup, reload your shell environment:

```bash
source ~/.zshenv  # or the appropriate file for your shell
```

## Step 3: Configure Providers

Providers can be configured through the Admin UI or the Admin API.

### Via Admin UI

1. Start the proxy: `npx claude-code-proxy start`
2. Open the admin UI in your browser (typically `http://localhost:3000`)
3. Navigate to the Providers page
4. Add providers with their base URL and API key

### Via Admin API

```bash
# Add a provider (API key stored in Keychain)
curl -X POST http://localhost:3456/admin/providers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "openrouter",
    "baseUrl": "https://openrouter.ai/api/v1",
    "keyId": "openrouter",
    "models": ["anthropic/claude-3.5-sonnet"],
    "enabled": true,
    "priority": 50
  }'
```

## Step 4: Verify Setup

Check that the proxy is running and configured correctly:

```bash
# Check proxy status
npx claude-code-proxy status

# Verify health endpoint
curl http://localhost:3456/health

# View current configuration
npx claude-code-proxy config
```

Expected health response:

```json
{
  "status": "ok",
  "version": "0.1.0",
  "port": 3456
}
```

## Step 5: Start Using Claude Code

Once the proxy is running and `ANTHROPIC_BASE_URL` is set, Claude Code will automatically route requests through the proxy.

```bash
claude "Hello, world!"
```

The proxy will:
1. Receive the request from Claude Code
2. Route it to the configured provider based on the model tier
3. Transform the response back to Anthropic format
4. Stream the result back to Claude Code

## Troubleshooting

If you encounter issues, see the [Troubleshooting Guide](troubleshooting.md) for common problems and solutions.

For a complete diagnostic, run:

```bash
npm run setup
```

The setup script includes a diagnostic report that checks proxy health, config file status, Keychain entries, and environment variables.
