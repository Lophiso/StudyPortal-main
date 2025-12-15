export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
}

const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_SEARCH_CX = process.env.GOOGLE_SEARCH_CX;

export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_CX) {
    console.warn('[searcher] Google Custom Search API key or CX missing; returning empty results.');
    return [];
  }

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', GOOGLE_SEARCH_API_KEY);
  url.searchParams.set('cx', GOOGLE_SEARCH_CX);
  url.searchParams.set('q', query);

  try {
    const res = await fetch(url.toString());

    if (!res.ok) {
      console.warn('[searcher] Google Custom Search request failed with status', res.status);
      return [];
    }

    const data: any = await res.json();
    const items: any[] = Array.isArray(data.items) ? data.items : [];

    return items.map((item) => ({
      title: item.title ?? '',
      link: item.link ?? '',
      snippet: item.snippet ?? '',
    }));
  } catch (error) {
    console.warn('[searcher] Google Custom Search request threw, returning empty results.', error);
    return [];
  }
}
