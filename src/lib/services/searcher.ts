import { search } from 'duck-duck-scrape';

export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
}

/**
 * Perform a polite DuckDuckGo web search.
 * Adds a small delay before each request to avoid hammering the service.
 */
export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  // 2s delay to be polite with free search provider
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const response = await search(query, {
    safeSearch: 'moderate',
    locale: 'en-us',
  });

  return (response.results || []).map((r: any) => ({
    title: r.title ?? '',
    link: r.url ?? '',
    snippet: r.description ?? '',
  }));
}
