# Claude Code Proxy

Route Claude Code requests through configured AI providers (OpenRouter, OpenCode, Ollama, Custom) without modifying Claude Code behavior.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run setup (configures ANTHROPIC_BASE_URL, creates config.json)
npm run setup
source ~/.zshenv  # or restart terminal

# 3. Start the proxy server
npx claude-code-proxy start

# 4. Verify setup
npx claude-code-proxy status
```

## Configuration

Configure providers via the admin API:

- `GET /admin/providers` — list providers
- `POST /admin/providers` — add provider (includes API key, stored in macOS Keychain)
- `GET /admin/routes` — view model mappings
- `PUT /admin/routes` — update model mappings

Default model mappings (per D-07):

- Opus → opencode/qwen3.6
- Sonnet → openrouter/mimo-v2-flash
- Haiku → opencode/nvidia/nemotron-3-super-120b-a12b:free

## Architecture

```
Claude Code CLI → localhost:3456 → Provider
                         ↑
                   Admin API (/admin)
```

Per D-01: Express.js sidecar on port 3456

Per D-13: Config at ~/.claude-code-proxy/config.json

## CLI Commands

```bash
# Configure Claude Code to use the proxy
npm run setup

# Start the proxy server
npx claude-code-proxy start

# Check if proxy is running
npx claude-code-proxy status

# Show current configuration
npx claude-code-proxy config
```

## API Keys

API keys are stored in macOS Keychain (per AUTH-02). They are never written to config files or logs.

To add a provider API key:

```bash
# Via the admin API (proxy must be running)
curl -X POST http://localhost:3456/admin/providers \
  -H "Content-Type: application/json" \
  -d '{"name": "openrouter", "baseUrl": "https://openrouter.ai/api/v1", "keyId": "openrouter", "models": []}'
```

Then use the Admin UI (Phase 3) or direct API calls to configure the actual API key, which gets stored in Keychain.

## Providers

### OpenRouter

OpenRouter aggregates many LLM providers. Get an API key at https://openrouter.ai/keys.

### OpenCode

OpenCode provides open models. Get an API key at https://opencode.ai/.

### Ollama

Ollama runs local models. Configure with your local Ollama server URL.

### Custom

Add any OpenAI-compatible API endpoint as a custom provider.

## Troubleshooting

**Proxy not running:**

```bash
npx claude-code-proxy start
```

**Claude Code not connecting:**

```bash
# Verify ANTHROPIC_BASE_URL is set
echo $ANTHROPIC_BASE_URL

# If not set, re-run setup
npm run setup
source ~/.zshenv
```

**View logs:**

The proxy logs to stdout. Check the terminal where you ran `npx claude-code-proxy start`.

**Check health:**

```bash
curl http://localhost:3456/health
```

For more detailed troubleshooting, see [docs/troubleshooting.md](docs/troubleshooting.md).

## E2E Testing

Run the full E2E test suite:

```bash
npm run test:e2e          # Full suite
npm run test:e2e:smoke    # Quick smoke tests
npm run test:e2e:ui       # Interactive UI mode
```

Tests verify proxy routing with all provider types (OpenRouter, OpenCode, Ollama, Custom), edge cases (provider unavailable, rate limiting, retry), and config export/import flows.

## Setup Script

The enhanced setup script automates Claude Code configuration:

```bash
npm run setup                    # Interactive setup
npm run setup -- --dry-run       # Preview changes
npm run setup -- --import backup.json  # Import from backup
npm run setup -- --non-interactive   # Skip prompts
```

The setup script configures ANTHROPIC_BASE_URL, creates default config.json, verifies provider connections, imports backup configs, configures Keychain, and generates a diagnostic report.

## Auto-Update

The desktop app includes automatic update checking via Tauri's updater plugin. Updates are downloaded from GitHub Releases and installed with cryptographic signature verification.

To build a release with auto-update artifacts:

```bash
npm run tauri build
```

This produces a .dmg file in src-tauri/target/release/bundle/dmg/ with integrated auto-update support.

## Documentation

- [Architecture Overview](docs/architecture.md)
- [Setup Guide](docs/setup-guide.md)
- [Configuration Reference](docs/configuration-reference.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Admin API Reference](docs/api-reference.md)
