/**
 * Seed script — pre-registers providers with their default models
 * Run: npx tsx scripts/seed-models.ts
 */

const PROXY_API = 'http://localhost:3456';

interface SeedProvider {
  name: string;
  baseUrl: string;
  providerType: string;
  models: string[];
  enabled: boolean;
  priority: number;
}

const providers: SeedProvider[] = [
  {
    name: 'openrouter',
    baseUrl: 'https://openrouter.ai/api',
    providerType: 'OpenRouter',
    models: [
      'moonshotai/kimi-k2.6',
      'deepseek/deepseek-v4-flash',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'inclusionai/ring-2.6-1t:free',
      'z-ai/glm-4.5-air:free',
      'openai/gpt-oss-120b:free',
    ],
    enabled: true,
    priority: 1,
  },
  {
    name: 'opencode-zen',
    baseUrl: 'https://opencode.ai/zen',
    providerType: 'OpenCode',
    models: [
      'qwen3.6',
      'qwen3.5',
      'qwen3-coder',
      'deepseek-v3',
      'deepseek-r1',
      'glm-4.5',
      'kimi-k2',
      'minimax-m2.5',
    ],
    enabled: true,
    priority: 2,
  },
  {
    name: 'opencode-go',
    baseUrl: 'https://opencode.ai/zen/go',
    providerType: 'OpenCode',
    models: [
      'kimi-k2.6',
      'kimi-k2.5',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'glm-5.1',
      'glm-5',
      'qwen3.6-plus',
      'qwen3.5-plus',
      'mimo-v2.5',
      'mimo-v2.5-pro',
      'minimax-m2.5',
      'minimax-m2.7',
    ],
    enabled: true,
    priority: 3,
  },
  {
    name: 'ollama',
    baseUrl: 'http://localhost:11434',
    providerType: 'Ollama',
    models: [], // Will be populated from locally downloaded models
    enabled: true,
    priority: 4,
  },
  {
    name: 'google-gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    providerType: 'google-gemini',
    models: [], // Discover via Scan after adding API key
    enabled: true,
    priority: 5,
  },
  {
    name: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    providerType: 'anthropic',
    models: [], // Discover via Scan after adding API key
    enabled: true,
    priority: 6,
  },
  {
    name: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    providerType: 'deepseek',
    models: [], // Discover via Scan after adding API key
    enabled: true,
    priority: 7,
  },
];

async function seed() {
  console.log('🌱 Seeding providers...\n');

  for (const p of providers) {
    try {
      const response = await fetch(`${PROXY_API}/admin/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: p.name,
          baseUrl: p.baseUrl,
          keyId: p.name,
          apiKey: '', // User will add API key via UI
          providerType: p.providerType,
          models: p.models,
          enabled: p.enabled,
          priority: p.priority,
        }),
      });

      if (response.ok) {
        console.log(`✅ ${p.name} — ${p.models.length} models registered`);
      } else {
        const body = await response.json();
        const errMsg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
        console.log(`⚠️  ${p.name} — ${errMsg}`);
      }
    } catch (error) {
      console.log(`❌ ${p.name} — failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  console.log('\n🌱 Done! Add API keys via the UI: Settings → Providers');
}

seed();
