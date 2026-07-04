/**
 * Upstream HTTP client with per-origin keep-alive via undici Agent.
 */

import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';

const agents = new Map<string, Agent>();

function getOrigin(url: string): string {
  return new URL(url).origin;
}

function getAgentForUrl(url: string): Agent {
  const origin = getOrigin(url);
  let agent = agents.get(origin);
  if (!agent) {
    agent = new Agent({
      connections: 32,
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 120_000,
    });
    agents.set(origin, agent);
  }
  return agent;
}

/** Fetch with keep-alive dispatcher for the request origin. */
export async function upstreamFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const dispatcher = getAgentForUrl(url);
  return undiciFetch(url, {
    ...(init as UndiciRequestInit),
    dispatcher,
  }) as unknown as Response;
}

/** @internal test helper */
export function getAgentForOrigin(origin: string): Agent | undefined {
  return agents.get(origin);
}

/** Close all pooled agents (graceful shutdown). */
export async function closeUpstreamAgents(): Promise<void> {
  const closing = [...agents.values()].map((a) => a.close());
  agents.clear();
  await Promise.all(closing);
}
