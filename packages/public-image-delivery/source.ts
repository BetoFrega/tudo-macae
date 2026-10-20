export function classifiedsImageSourceUrl(key: string, origin: string): string | null {
  try {
    const target = new URL(origin);
    if (target.protocol !== "https:" || target.pathname !== "/" || target.search || target.hash || target.username || target.password) return null;
    target.pathname = `/api/classifieds/photos/public/${encodeURIComponent(key)}`;
    return target.href;
  }
  catch { return null; }
}
