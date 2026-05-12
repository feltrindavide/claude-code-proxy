const UPDATE_URL = 'https://github.com/feltrindavide/claude-code-proxy/releases/latest/download/latest.json';
const RELEASES_URL = 'https://github.com/feltrindavide/claude-code-proxy/releases/latest';

export async function checkForUpdates(): Promise<{ available: boolean; version?: string }> {
  try {
    const resp = await fetch(UPDATE_URL);
    const data = await resp.json();
    const latestVersion = data.version;

    // Read current version from health endpoint
    const healthResp = await fetch('http://localhost:3456/health');
    const health = await healthResp.json();
    const currentVersion = health.version || '0.0.0';

    console.log(`[Update] Current: ${currentVersion}, Latest: ${latestVersion}`);

    if (latestVersion > currentVersion) {
      return { available: true, version: latestVersion };
    }

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
