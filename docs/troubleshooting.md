# Troubleshooting

Common issues and their solutions for Claude Code Proxy.

## Common Issues

### Proxy Not Starting

**Symptom:** `npx claude-code-proxy start` fails or exits immediately.

**Solutions:**

1. Ensure dependencies are installed:
   ```bash
   npm install
   ```

2. Check if port 3456 is already in use:
   ```bash
   lsof -i :3456
   ```
   If another process is using the port, either stop it or change the proxy port.

3. Start the proxy manually:
   ```bash
   npx claude-code-proxy start
   ```

4. Check for TypeScript compilation errors in the terminal output.

### Provider Connection Failures

**Symptom:** Provider shows as unreachable or returns errors.

**Solutions:**

1. **Verify baseUrl is correct:**
   - Remote providers must use `https://`
   - Local providers (Ollama) use `http://localhost:<port>`

2. **Check API key in Keychain:**
   ```bash
   # Run setup to check Keychain status
   npm run setup
   ```
   The diagnostic report shows which providers have keys stored.

3. **Test connectivity manually:**
   ```bash
   curl -H "Authorization: Bearer your-api-key" https://provider-api.example.com/v1/models
   ```

4. **Verify provider is enabled:**
   Check `config.json` — the provider's `enabled` field should be `true`.

### Keychain Access Denied

**Symptom:** Error storing or retrieving API keys from Keychain.

**Solutions:**

1. **Grant Keychain access:**
   - Open **Keychain Access** app on macOS
   - Search for `claude-code-proxy`
   - Ensure the app has permission to access these entries

2. **Re-run setup with Keychain configuration:**
   ```bash
   npm run setup
   ```
   The setup script will prompt for missing keys.

3. **Check keytar installation:**
   ```bash
   npm list keytar
   ```
   If missing, reinstall: `npm install keytar`

### Config File Corruption

**Symptom:** Proxy starts but configuration appears empty or invalid.

**Solutions:**

1. **Delete and recreate config:**
   ```bash
   rm ~/.claude-code-proxy/config.json
   npm run setup
   ```

2. **Restore from backup:**
   If you have a backup file:
   ```bash
   npm run setup -- --import /path/to/backup.json
   ```

3. **Validate config manually:**
   ```bash
   cat ~/.claude-code-proxy/config.json | python3 -m json.tool
   ```

### Port Conflicts

**Symptom:** Proxy fails to start with "EADDRINUSE" error.

**Solutions:**

1. **Find the conflicting process:**
   ```bash
   lsof -i :3456
   ```

2. **Stop the process or change the port:**
   ```bash
   # Kill the process (replace PID)
   kill <PID>
   ```

3. **Restart the proxy:**
   ```bash
   npx claude-code-proxy start
   ```

## Diagnostic Commands

### Health Check

Verify the proxy is running and responding:

```bash
curl http://localhost:3456/health
```

Expected response:
```json
{ "status": "ok", "version": "0.1.0", "port": 3456 }
```

### Config Validation

View current proxy configuration:

```bash
npx claude-code-proxy config
```

This fetches providers and routes from the running proxy.

### Provider Verification

Check all configured providers:

```bash
curl http://localhost:3456/admin/providers
```

### Full Diagnostic Report

Run the setup script for a comprehensive diagnostic:

```bash
npm run setup
```

This checks proxy health, config file status, Keychain entries, environment variables, and Node.js version.

## Log Locations

| Source          | Location                                    |
|-----------------|---------------------------------------------|
| Proxy logs      | Terminal where proxy was started (stdout)   |
| Tauri console   | Tauri dev mode output                       |
| System logs     | macOS Console.app (search for proxy process)|

## E2E Test Issues

If E2E tests fail with connection refused errors:

1. **Ensure proxy is not already running** on port 3456 (tests start their own instance)

2. **Use isolated test config:**
   ```bash
   CONFIG_DIR=/tmp/claude-proxy-e2e-test npm run test:e2e
   ```

3. **Clean test state:**
   ```bash
   rm -rf /tmp/claude-proxy-e2e-test
   ```

## Getting Help

If the issue is not covered here:

1. Run the diagnostic report: `npm run setup`
2. Check proxy logs in the terminal where it started
3. Review the [Configuration Reference](configuration-reference.md) for valid settings
4. Check the [Admin API Reference](api-reference.md) for endpoint details
