/** Normalize Next.js pathname (handles trailingSlash: true → `/popup/`). */
export function normalizeRoute(pathname: string | null | undefined): string {
  if (!pathname) return '/';
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function isRoute(pathname: string | null | undefined, route: string): boolean {
  return normalizeRoute(pathname) === route;
}
