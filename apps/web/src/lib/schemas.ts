import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.string().optional(),
  port: z.number().optional(),
  version: z.string().nullable().optional(),
  uptimeMs: z.number().nullable().optional(),
  activeStreams: z.number().nullable().optional(),
  host: z.string().optional(),
});

export const ProviderSchema = z.object({
  name: z.string(),
  baseUrl: z.string(),
  keyId: z.union([z.string(), z.undefined()]).transform((v) => (typeof v === 'string' ? v : '')),
  keyMask: z.union([z.string(), z.null(), z.undefined()]).transform((v) => (typeof v === 'string' ? v : null)),
  models: z.array(z.string()),
  enabled: z.boolean(),
  priority: z.number(),
  providerType: z.string().optional(),
  autoDiscovered: z.boolean().optional(),
});

export type ApiProvider = z.output<typeof ProviderSchema>;

export const ProvidersArraySchema = z.array(ProviderSchema);

export const RouteEntrySchema = z.object({
  claudeTier: z.enum(['opus', 'sonnet', 'haiku']),
  providerName: z.string(),
  targetModel: z.string(),
});

export const RoutesResponseSchema = z.object({
  routes: z.array(RouteEntrySchema),
  subagentModel: z.string().optional(),
});

export const DiscoveryStatusSchema = z.object({
  enabled: z.boolean().default(false),
  config: z.object({
    enabled: z.boolean(),
    intervalMs: z.number(),
    ollama: z.boolean(),
    lmStudio: z.boolean(),
    llamaCpp: z.boolean(),
  }).default({
    enabled: false,
    intervalMs: 60_000,
    ollama: true,
    lmStudio: true,
    llamaCpp: true,
  }),
  providers: z.array(z.object({
    name: z.string(),
    reachable: z.boolean(),
  })),
});

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  error: z.string().optional(),
  models: z.array(z.string()).optional(),
});

export const SuccessResponseSchema = z.object({
  success: z.boolean(),
});

export const BootstrapTokenSchema = z.object({
  token: z.string(),
});
