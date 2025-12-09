import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const SEARCH_URL =
  'https://www.google.com/search?q=PhD+computer+science+jobs+ibox&ibp=htl;jobs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs = 1000, maxMs = 3000) {
  const delta = maxMs - minMs;
  return sleep(minMs + Math.floor(Math.random() * delta));
}

async function launchBrowser() {
  const isProd = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

  if (isProd) {
    const executablePath = await chromium.executablePath();

    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });
  }

  return puppeteer.launch({
    headless: true,
  });
}

async function extractJobsFromPage(page) {
  const jobs = await page.evaluate(() => {
    const normalize = (el) => (el ? (el.textContent || '').trim() : '');

    const cards = Array.from(
      document.querySelectorAll('[data-hveid][jscontroller][data-ved]')
    );

    const results = [];

    for (const card of cards) {
      const titleEl =
        card.querySelector('div[role="heading"], .BjJfJf, .nJj2rb, h2, h3');
      const companyEl = card.querySelector('.vNEEBe, .Qk80Jf, .wHYlTd');
      const locationEl = card.querySelector('.Qk80Jf + span, .Qk80Jf ~ span');
      const dateEl = card.querySelector('.LL4CDc, .LL4CDc span');

      const linkEl = card.querySelector('a[href^="https://"]');

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
  console.log('[freeJobFetcher] extracted jobs count:', Array.isArray(jobs) ? jobs.length : 'not-array');

  return jobs;
}

export async function fetchJobsViaPuppeteer() {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();

    await page.goto(SEARCH_URL, {
      waitUntil: 'networkidle2',
    });

    try {
      const title = await page.title();
      console.log('[freeJobFetcher] page title:', title);
    } catch {
      console.log('[freeJobFetcher] failed to read page title');
    }

    await randomDelay();

    const jobs = await extractJobsFromPage(page);
    return jobs;
  } finally {
    await browser.close().catch(() => {});
  }
}
