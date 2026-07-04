---
name: proxy-context
description: "Shows Claude Code Proxy provider context usage — which model was used last, token consumption, and context window fill. Use when asked about proxy model, provider routing, or token inflation."
trigger: /proxy-context
proxy-version: 0.0.0
---

# /proxy-context

Show last request context usage from the Claude Code Proxy. Displays which model was used, provider, tier, tokens consumed, and token inflation factor.

## Usage

```
/proxy-context
```

## Output

Run the script directly (Fetch does not work on localhost):

```
node ~/.claude/claude-code-proxy/scripts/context-status.js
```

Then show the result as a table with:
- **Model**: the model name from the script output
- **Provider**: check the provider from the last usage
- **Tier**: `opus` / `sonnet` / `haiku`
- **Tokens**: input + output (sum from last usage)
- **Context window**: from model config
- **Inflation**: the token inflation factor applied

## Notes

- Requires Claude Code Proxy running on `localhost:3456`
- Shows the **last request** usage (not real-time accumulation)
- Token counts are estimates (chars/4)
- Output tokens may be inflated by proxy's token inflation system
- Skill auto-updates when the proxy app version changes (`proxy-version` in frontmatter)
