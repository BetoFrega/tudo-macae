export function parseEditorialImageKey(key: string): { mediaId: string; digest: string } | null {
  const match = /^editorial\/([A-Za-z0-9_-]{1,128})\/([a-f0-9]{64})$/.exec(key);
  return match ? { mediaId: match[1]!, digest: match[2]! } : null;
}

export function editorialImageKey(mediaId: string, digest: string): string | null {
  const key = `editorial/${mediaId}/${digest}`;
  return parseEditorialImageKey(key) ? key : null;
}

export function editorialImageSourceUrl(key: string, origin: string): string | null {
  if (!parseEditorialImageKey(key)) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
    url.pathname = `/api/imagens/${key}`;
    return url.href;
  }
  catch {
    return null;
  }
}
