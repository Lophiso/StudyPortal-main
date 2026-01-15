type RobotsRule = { disallow: string };

type RobotsCacheEntry = {
  fetchedAt: number;
  rules: RobotsRule[];
};

const cache = new Map<string, RobotsCacheEntry>();
const TTL_MS = 6 * 60 * 60 * 1000;

function parseRobots(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let inGlobal = false;
  const disallow: string[] = [];

  for (const line of lines) {
    const cleaned = line.split('#')[0].trim();
    if (!cleaned) continue;

    const lower = cleaned.toLowerCase();
    if (lower.startsWith('user-agent:')) {
      const ua = cleaned.split(':')[1]?.trim() ?? '';
      inGlobal = ua === '*';
      continue;
    }

    if (!inGlobal) continue;

    if (lower.startsWith('disallow:')) {
      const path = cleaned.split(':')[1]?.trim() ?? '';
      if (path) disallow.push(path);
    }
  }

  return disallow.map((p) => ({ disallow: p }));
}

export async function isAllowedByRobots(args: {
  url: string;
  userAgent: string;
}): Promise<boolean> {
  let host: string;
  let path: string;
  let origin: string;

  try {
    const u = new URL(args.url);
    host = u.hostname.replace(/^www\./, '').toLowerCase();
    path = u.pathname || '/';
    origin = u.origin;
  } catch {
    return true;
  }

  const now = Date.now();
  const cached = cache.get(host);
  if (cached && now - cached.fetchedAt < TTL_MS) {
    return !cached.rules.some((r) => r.disallow !== '/' && path.startsWith(r.disallow));
  }

  try {
    const robotsUrl = `${origin}/robots.txt`;
    const res = await fetch(robotsUrl, {
      headers: {
        'User-Agent': args.userAgent,
        Accept: 'text/plain,*/*;q=0.8',
      },
    });

    if (!res.ok) {
      cache.set(host, { fetchedAt: now, rules: [] });
      return true;
    }

    const text = await res.text();
    const rules = parseRobots(text);
    cache.set(host, { fetchedAt: now, rules });

    return !rules.some((r) => r.disallow !== '/' && path.startsWith(r.disallow));
  } catch {
    cache.set(host, { fetchedAt: now, rules: [] });
    return true;
  }
}
