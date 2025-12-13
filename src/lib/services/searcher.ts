import { search } from 'duck-duck-scrape';
import UserAgent from 'fake-useragent';

export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Perform a "stealthy" DuckDuckGo web search.
 * - Random 4-8s delay before each request.
 * - Random User-Agent per call.
 * - Single retry with a 20s cooldown on failure.
 */
export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  const attempt = async (): Promise<WebSearchResult[]> => {
    // Random jitter between 4s and 8s to avoid looking like a tight loop.
    const jitterMs = randomInt(4000, 8000);
    await sleep(jitterMs);

    // Rotate User-Agent per request. Note: duck-duck-scrape does not expose
    // header configuration directly, but setting a UA here may still help
    // where it is supported internally.
    const ua = new UserAgent().toString();

    const response = await search(query, {
      locale: 'en-us',
      // Some versions of duck-duck-scrape accept a 'userAgent' option.
      // If ignored, this is still safe.
      userAgent: ua as any,
    } as any);

    return (response.results || []).map((r: any) => ({
      title: r.title ?? '',
      link: r.url ?? '',
      snippet: r.description ?? '',
    }));
  };

  try {
    return await attempt();
  } catch (error) {
    console.warn('[searcher] DuckDuckGo search failed, cooling down for retry…', error);
    // If DDG is rate-limiting (429/403 or generic anomaly), back off hard
    // before a single retry.
    await sleep(20_000);

    try {
      return await attempt();
    } catch (secondError) {
      console.warn('[searcher] DuckDuckGo search failed again, returning empty result set.', secondError);
      return [];
    }
  }
}
