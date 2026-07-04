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
