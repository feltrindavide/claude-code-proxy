import { describe, it, expect } from 'vitest';
import {
  parseSkillVersion,
  injectSkillVersion,
  shouldSyncSkill,
} from '../src/services/plugin-installer.js';

describe('plugin-installer', () => {
  const sample = `---
name: proxy-context
proxy-version: 1.0.0
---

# Skill
`;

  it('parses proxy-version from frontmatter', () => {
    expect(parseSkillVersion(sample)).toBe('1.0.0');
  });

  it('injects version into skill without field', () => {
    const out = injectSkillVersion('---\nname: test\n---\n', '2.0.0');
    expect(out).toContain('proxy-version: 2.0.0');
  });

  it('updates version when bundled version changes', () => {
    expect(shouldSyncSkill(sample, '1.0.0')).toBe(false);
    expect(shouldSyncSkill(sample, '1.1.0')).toBe(true);
    expect(shouldSyncSkill(null, '1.0.0')).toBe(true);
  });
});
