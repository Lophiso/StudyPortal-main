export const CANADA_DOMAIN_BLACKLIST = [
  'instagram.com',
  'facebook.com',
  'twitter.com',
  'x.com',
] as const;

export function getHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export function isBlacklistedHost(url: string) {
  const host = getHost(url);
  if (!host) return false;
  return CANADA_DOMAIN_BLACKLIST.some((d) => host === d || host.endsWith(`.${d}`));
}
