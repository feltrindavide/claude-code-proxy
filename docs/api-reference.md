# Admin API Reference

Complete reference for the Claude Code Proxy Admin API endpoints.

**Base URL:** `http://localhost:3456`

All endpoints accept and return JSON.

## Endpoints

### GET /admin/config

Returns the current proxy configuration.

**Response:**
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
    }
  ],
  "routes": [
    { "claudeTier": "opus", "providerName": "opencode", "targetModel": "qwen3.6" }
  ],
  "version": "0.1.0"
}
```

### PUT /admin/config

Updates the proxy configuration.

**Request body:**
```json
{
  "providers": [...],
  "routes": [...]
}
```

**Response:**
```json
{ "success": true }
```

### GET /admin/providers

Lists all configured providers. API keys are masked.

**Response:**
```json
[
  {
    "name": "openrouter",
    "baseUrl": "https://openrouter.ai/api/v1",
    "keyId": "openrouter",
    "keyMask": "••••",
    "models": ["anthropic/claude-3.5-sonnet"],
    "enabled": true,
    "priority": 50
  }
]
```

### POST /admin/providers

Adds a new provider and stores its API key in Keychain.

**Request body:**
```json
{
  "name": "openrouter",
  "baseUrl": "https://openrouter.ai/api/v1",
  "keyId": "openrouter",
  "models": ["anthropic/claude-3.5-sonnet"],
  "apiKey": "your-api-key-here",
  "enabled": true,
  "priority": 50
}
```

**Response:**
```json
{
  "success": true,
  "keyId": "openrouter",
  "validation": { "valid": true }
}
```

### DELETE /admin/providers/:id

Removes a provider and its Keychain entry.

**Response:**
```json
{ "success": true }
```

### POST /admin/providers/:id/validate

Validates provider connectivity.

**Response:**
```json
{ "valid": true }
```
or
```json
{ "valid": false, "error": "Connection failed" }
```

### GET /admin/routes

Returns current model route mappings.

**Response:**
```json
[
  { "claudeTier": "opus", "providerName": "opencode", "targetModel": "qwen3.6" },
  { "claudeTier": "sonnet", "providerName": "openrouter", "targetModel": "mimo-v2-flash" },
  { "claudeTier": "haiku", "providerName": "opencode", "targetModel": "nvidia/nemotron-3-super-120b-a12b:free" }
]
```

### PUT /admin/routes

Updates model route mappings.

**Request body:**
```json
{
  "routes": [
    { "claudeTier": "opus", "providerName": "opencode", "targetModel": "qwen3.6" }
  ]
}
```

**Response:**
```json
{ "success": true }
```

### GET /admin/logs

Returns the last 50 request log entries.

**Response:**
```json
[
  {
    "timestamp": "2026-05-11T00:00:00.000Z",
    "provider": "openrouter",
    "model": "anthropic/claude-3.5-sonnet",
    "status": 200,
    "latency": 1234
  }
]
```

### GET /admin/config/export

Exports current configuration with masked API keys.

**Response:**
```json
{
  "providers": [
    { "name": "openrouter", "baseUrl": "...", "keyId": "••••", "models": [...], "enabled": true, "priority": 50 }
  ],
  "routes": [...],
  "settings": { "port": 3456 }
}
```

### POST /admin/config/import

Imports configuration from a JSON payload.

**Request body:**
```json
{
  "data": {
    "providers": [...],
    "routes": [...]
  },
  "strategy": "merge"
}
```

**Strategy values:**
- `merge` — Combines providers (dedup by name, incoming wins), replaces routes
- `replace` — Replaces all providers and routes with incoming data

**Response:**
```json
{ "success": true, "backupPath": "~/.claude-code-proxy/config-backup-2026-05-11.json" }
```

### GET /admin/rate-limits

Returns all provider rate limits.

**Response:**
```json
[
  { "providerName": "openrouter", "requestsPerMinute": 60 }
]
```

### GET /admin/providers/:id/rate-limit

Returns the rate limit for a specific provider.

**Response:**
```json
{ "providerName": "openrouter", "requestsPerMinute": 60 }
```

### PUT /admin/providers/:id/rate-limit

Updates the rate limit for a specific provider (1-1000 RPM).

**Request body:**
```json
{ "requestsPerMinute": 60 }
```

**Response:**
```json
{ "success": true, "providerName": "openrouter", "requestsPerMinute": 60 }
```

### GET /admin/validation-results

Returns persisted validation results for UI display.

### POST /admin/validation-results/:id/dismiss

Dismisses a validation warning for a provider.

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "port": 3456
}
```

## Error Responses

### 400 — Validation Error

Returned when request body fails input validation.

```json
{
  "error": [
    { "code": "too_small", "message": "Name must be at least 1 character", "path": ["name"] }
  ]
}
```

### 404 — Not Found

Returned when a requested resource does not exist.

```json
{ "error": "Provider not found" }
```

### 500 — Internal Error

Returned when an unexpected error occurs on the server.

```json
{ "error": "Failed to load config" }
```
