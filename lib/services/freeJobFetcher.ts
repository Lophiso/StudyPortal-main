import chromium from '@sparticuz/chromium';
import puppeteer, { Browser, Page } from 'puppeteer-core';

export interface ScrapedJob {
  title: string;
  company: string;
  location: string | null;
  postedAt: string | null;
  link: string;
  rawText: string;
}

const SEARCH_URL =
  'https://www.google.com/search?q=PhD+computer+science+jobs+ibox&ibp=htl;jobs';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs = 1000, maxMs = 3000) {
  const delta = maxMs - minMs;
  return sleep(minMs + Math.floor(Math.random() * delta));
}

async function launchBrowser(): Promise<Browser> {
  const isProd = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

  if (isProd) {
    const executablePath = await chromium.executablePath();

    const defaultViewport =
      ((chromium as unknown as { defaultViewport?: NonNullable<Parameters<typeof puppeteer.launch>[0]>['defaultViewport'] })
        .defaultViewport ?? { width: 1280, height: 720 });

    const headless =
      ((chromium as unknown as { headless?: boolean }).headless ?? true);

    return puppeteer.launch({
      args: chromium.args,
      defaultViewport,
      executablePath,
      headless,
    });
  }

  // Local dev: use system Chrome/Chromium
  return puppeteer.launch({
    headless: true,
  });
}

async function extractJobsFromPage(page: Page): Promise<ScrapedJob[]> {
  const jobs = await page.evaluate(() => {
    const normalize = (el: Element | null) =>
      el ? (el.textContent || '').trim() : '';

    // Heuristic Google Jobs cards selector; may need tweaking over time.
    const cards = Array.from(
      document.querySelectorAll('[data-hveid][jscontroller][data-ved]')
    ) as HTMLElement[];

    const results: ScrapedJob[] = [];

    for (const card of cards) {
      const titleEl =
        card.querySelector('div[role="heading"], .BjJfJf, .nJj2rb, h2, h3');
      const companyEl = card.querySelector('.vNEEBe, .Qk80Jf, .wHYlTd');
      const locationEl = card.querySelector('.Qk80Jf + span, .Qk80Jf ~ span');
      const dateEl = card.querySelector('.LL4CDc, .LL4CDc span');

      const linkEl = card.querySelector<HTMLAnchorElement>('a[href^="https://"]');

      const title = normalize(titleEl);
      const company = normalize(companyEl);
      const location = normalize(locationEl) || null;
      const postedAt = normalize(dateEl) || null;
      const link = linkEl?.href || '';

      const rawText = (card.innerText || '').trim();

      if (!title || !link) continue;

      results.push({
        title,
        company,
        location,
        postedAt,
        link,
        rawText,
      });
    }

    return results;
  });

  return jobs;
}

export async function fetchJobsViaPuppeteer(): Promise<ScrapedJob[]> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();

    await page.goto(SEARCH_URL, {
      waitUntil: 'networkidle2',
    });

    await randomDelay();

    const jobs = await extractJobsFromPage(page);
    return jobs;
  } finally {
    await browser.close().catch(() => {});
  }
}
