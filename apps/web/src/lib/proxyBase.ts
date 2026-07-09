const DEFAULT_PORT = 3456;

let httpBase = `http://localhost:${DEFAULT_PORT}`;

export function getProxyHttpBase(): string {
  return httpBase;
}

export function getProxyWsBase(): string {
  return httpBase.replace(/^http/, 'ws');
}

export function setProxyHttpBaseFromPort(port: number | null | undefined): void {
  const p = port && port > 0 ? port : DEFAULT_PORT;
  httpBase = `http://localhost:${p}`;
}

export function setProxyHttpBase(url: string): void {
  httpBase = url.replace(/\/$/, '');
}

/** Dashboard UI base — Next dev server in development, proxy static export in production. */
export function getDashboardBase(): string {
  if (typeof window !== 'undefined') {
    const { hostname, port } = window.location;
    if (hostname === 'localhost' && port === '3457') {
      return 'http://localhost:3457';
    }
  }
  return getProxyHttpBase();
}
