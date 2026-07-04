/**
 * Proxy-context plugin installation and skill version sync.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const SKILL_VERSION_RE = /^proxy-version:\s*(.+)$/m;

export function parseSkillVersion(content: string): string | null {
  const match = content.match(SKILL_VERSION_RE);
  return match?.[1]?.trim() || null;
}

export function injectSkillVersion(content: string, version: string): string {
  if (SKILL_VERSION_RE.test(content)) {
    return content.replace(SKILL_VERSION_RE, `proxy-version: ${version}`);
  }
  if (content.startsWith('---\n')) {
    return content.replace('---\n', `---\nproxy-version: ${version}\n`);
  }
  return `---\nproxy-version: ${version}\n---\n\n${content}`;
}

export function shouldSyncSkill(installedContent: string | null, bundledVersion: string): boolean {
  if (!installedContent) return true;
  const installedVersion = parseSkillVersion(installedContent);
  return installedVersion !== bundledVersion;
}

export interface PluginInstallPaths {
  skillDest: string;
  statusScriptDest: string;
  compactHookDest: string;
  settingsPath: string;
}

export function resolvePluginPaths(home = os.homedir()): PluginInstallPaths {
  return {
    skillDest: path.join(home, '.claude', 'skills', 'proxy-context', 'SKILL.md'),
    statusScriptDest: path.join(home, '.claude', 'claude-code-proxy', 'scripts', 'context-status.js'),
    compactHookDest: path.join(home, '.claude', 'claude-code-proxy', 'scripts', 'auto-compact-hook.js'),
    settingsPath: path.join(home, '.claude', 'settings.json'),
  };
}

export function syncSkillFile(
  skillSrc: string,
  skillDest: string,
  appVersion: string,
): 'installed' | 'updated' | 'skipped' {
  if (!fs.existsSync(skillSrc)) return 'skipped';

  const bundled = fs.readFileSync(skillSrc, 'utf-8');
  const versioned = injectSkillVersion(bundled, appVersion);

  let installed: string | null = null;
  if (fs.existsSync(skillDest)) {
    installed = fs.readFileSync(skillDest, 'utf-8');
  }

  if (!shouldSyncSkill(installed, appVersion)) {
    return 'skipped';
  }

  fs.mkdirSync(path.dirname(skillDest), { recursive: true, mode: 0o700 });
  fs.writeFileSync(skillDest, versioned, { mode: 0o600 });
  return installed ? 'updated' : 'installed';
}

export function syncScriptFile(src: string, dest: string): boolean {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  fs.writeFileSync(dest, fs.readFileSync(src, 'utf-8'), { mode: 0o755 });
  return true;
}
