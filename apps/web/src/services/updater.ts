const UPDATE_URL = 'https://github.com/feltrindavide/claude-code-proxy/releases/latest/download/latest.json';
const RELEASES_URL = 'https://github.com/feltrindavide/claude-code-proxy/releases/latest';

export async function checkForUpdates(): Promise<{ available: boolean; version?: string }> {
  try {
    console.log('[Update] Fetching', UPDATE_URL);
    const resp = await fetch(UPDATE_URL);
    console.log('[Update] Response status:', resp.status, resp.ok);
    const data = await resp.json();
    const latestVersion = data.version;
    console.log('[Update] Latest version from GitHub:', latestVersion);

    // Read current version from health endpoint
    const healthResp = await fetch('http://localhost:3456/health');
    const health = await healthResp.json();
    const currentVersion = health.version || '0.0.0';
    console.log('[Update] Current version from proxy:', currentVersion);

    // Parse semver strings into number arrays for comparison
    const parseVer = (v: string): number[] => v.split('.').map(n => parseInt(n, 10) || 0);
    const current = parseVer(currentVersion);
    const latest = parseVer(latestVersion);
    console.log('[Update] Parsed current:', current, 'latest:', latest);

    // Compare version arrays
    for (let i = 0; i < Math.max(current.length, latest.length); i++) {
      const c = current[i] || 0;
      const l = latest[i] || 0;
      if (l > c) {
        console.log('[Update] Update available!');
        return { available: true, version: latestVersion };
      }
      if (l < c) {
        console.log('[Update] Current is newer than latest (dev)');
        return { available: false };
      }
    }

    console.log('[Update] Versions are equal, no update');
    return { available: false };
  } catch (error) {
    console.error('[Update] Check failed:', error);
    return { available: false };
  }
}

export function openDownloadPage(): void {
  const tauri = (window as any).__TAURI__;
  if (tauri?.shell?.open) {
    tauri.shell.open(RELEASES_URL);
  } else {
    window.open(RELEASES_URL, '_blank');
  }
}
