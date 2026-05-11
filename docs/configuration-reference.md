# Configuration Reference

Complete reference for the Claude Code Proxy configuration system.

## config.json Location

- **Path:** `~/.claude-code-proxy/config.json`
- **Directory:** `~/.claude-code-proxy/` (created automatically if missing)
- **Permissions:** 0o600 (owner read/write only)
- **Write pattern:** Atomic (temp file + rename to prevent corruption)

## providers[] Schema

Each provider in the `providers` array has the following fields:

| Field      | Type     | Required | Default | Description                                      |
|------------|----------|----------|---------|--------------------------------------------------|
| name       | string   | Yes      | —       | Provider identifier (alphanumeric, dashes, underscores, max 50 chars) |
| baseUrl    | string   | Yes      | —       | API endpoint URL (must be HTTPS or localhost)    |
| keyId      | string   | Yes      | —       | Keychain account name for API key lookup         |
| models     | string[] | Yes      | []      | Available model identifiers for this provider    |
| enabled    | boolean  | No       | true    | Whether the provider is active for routing       |
| priority   | number   | No       | 50      | Routing priority (0-100, higher = preferred)     |

### Provider Name Constraints

- Alphanumeric characters, dashes (`-`), and underscores (`_`) only
- Maximum length: 50 characters
- Examples: `openrouter`, `opencode`, `my-custom-provider`

### Base URL Constraints

- Must use `https://` scheme for remote providers
- `localhost` or `127.0.0.1` allowed for local providers (e.g., Ollama)
- Examples: `https://openrouter.ai/api/v1`, `http://localhost:11434`

### Example Provider

```json
{
  "name": "openrouter",
  "baseUrl": "https://openrouter.ai/api/v1",
  "keyId": "openrouter",
  "models": ["anthropic/claude-3.5-sonnet", "anthropic/claude-3-opus"],
  "enabled": true,
  "priority": 50
}
```

## routes[] Schema

Each route in the `routes` array maps a Claude model tier to a specific provider and model:

| Field        | Type   | Required | Description                                      |
|--------------|--------|----------|--------------------------------------------------|
| claudeTier   | enum   | Yes      | Claude model tier: `opus`, `sonnet`, or `haiku`  |
| providerName | string | Yes      | Must match a provider's `name` field             |
| targetModel  | string | Yes      | Provider-specific model identifier               |

### Claude Tier Values

- `opus` — Highest quality tier (Claude Opus)
- `sonnet` — Balanced quality/cost tier (Claude Sonnet)
- `haiku` — Fastest/cheapest tier (Claude Haiku)

### Example Route

```json
{
  "claudeTier": "sonnet",
  "providerName": "openrouter",
  "targetModel": "anthropic/claude-3.5-sonnet"
}
```

## Default Mappings

The default configuration includes these model mappings:

| Claude Tier | Provider   | Target Model                                  |
|-------------|------------|-----------------------------------------------|
| opus        | opencode   | qwen3.6                                       |
| sonnet      | openrouter | mimo-v2-flash                                 |
| haiku       | opencode   | nvidia/nemotron-3-super-120b-a12b:free        |

## Complete Example config.json

```json
{
  "providers": [
    {
      "name": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "keyId": "openrouter",
      "models": ["anthropic/claude-3.5-sonnet"],
      "enabled": true,
      "priority": 50
    },
    {
      "name": "opencode",
      "baseUrl": "https://api.opencode.ai/v1",
      "keyId": "opencode",
      "models": ["qwen3.6"],
      "enabled": true,
      "priority": 50
    }
  ],
  "routes": [
    { "claudeTier": "opus", "providerName": "opencode", "targetModel": "qwen3.6" },
    { "claudeTier": "sonnet", "providerName": "openrouter", "targetModel": "mimo-v2-flash" },
    { "claudeTier": "haiku", "providerName": "opencode", "targetModel": "nvidia/nemotron-3-super-120b-a12b:free" }
  ],
  "version": "0.1.0"
}
```

## Environment Variables

| Variable             | Default                     | Description                                    |
|----------------------|-----------------------------|------------------------------------------------|
| ANTHROPIC_BASE_URL   | (not set)                   | Must be `http://localhost:3456` for Claude Code to use the proxy |
| CONFIG_DIR           | `~/.claude-code-proxy/`     | Override config directory (useful for testing) |

## Config File Operations

### Via Setup Script

```bash
npm run setup                    # Create default config
npm run setup -- --import file.json  # Import from backup
```

### Via Admin API

```bash
# View current config
curl http://localhost:3456/admin/config

# Update config
curl -X PUT http://localhost:3456/admin/config \
  -H "Content-Type: application/json" \
  -d '{"providers": [...], "routes": [...]}'

# Export config (keys masked)
curl http://localhost:3456/admin/config/export

# Import config
curl -X POST http://localhost:3456/admin/config/import \
  -H "Content-Type: application/json" \
  -d '{"data": {"providers": [...], "routes": [...]}, "strategy": "merge"}'
```

## Security Notes

- API keys are **never** stored in `config.json`
- The `keyId` field is only an account name for Keychain lookup
- Export operations mask sensitive identifiers
- Config files are written with mode 0o600 (owner-only access)
