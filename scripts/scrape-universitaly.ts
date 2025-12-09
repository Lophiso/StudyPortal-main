import fs from 'fs';
import path from 'path';
import puppeteer, { Browser, Page } from 'puppeteer';

interface ItalyCourse {
  courseName: string;
  universityName: string;
  degreeType: string;
  duration: string;
  language: string;
  link: string | null;
}

async function goToEnglishHome(page: Page) {
  await page.goto('https://www.universitaly.it/', { waitUntil: 'networkidle2' });

  // Try to click ENG / English toggle in the header
  const langSelectors = [
    'a[lang="en"]',
    'button[lang="en"]',
    'a:contains("ENG")',
  ];

  for (const selector of langSelectors) {
    try {
      const el = await page.$(selector as any);
      if (el) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
          el.click(),
        ]);
        break;
      }
    } catch {
      // ignore and try next selector
    }
  }
}

async function openCourseSearch(page: Page) {
  // Try clicking the big "Find" button first
  const findButtonCandidates = [
    'a[href*="cerca-corsi"]',
    'a.btn-primary',
    'a.button',
  ];

  for (const selector of findButtonCandidates) {
    const el = await page.$(selector as any).catch(() => null);
    if (el) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
        el.click(),
      ]);
      break;
    }
  }

  // Fallback: go directly to the search route
  if (!page.url().includes('cerca-corsi')) {
    await page.goto('https://www.universitaly.it/cerca-corsi', {
      waitUntil: 'networkidle2',
    });
  }
}

async function applyEnglishFilter(page: Page) {
  // Best‑effort: look for a filter block with text "Course language" then a checkbox with label containing "English"
  try {
    // Try clicking the English language checkbox directly by label text
    const labelXPath = "//label[contains(translate(normalize-space(.), 'english', 'ENGLISH'), 'ENGLISH')]";
    const [label] = await page.$x(labelXPath);
    if (label) {
      await (label as any).click();
      await page.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 }).catch(() => {});
    }
  } catch {
    // If this fails, we just continue without language filtering
  }
}

async function scrapePageCourses(page: Page): Promise<ItalyCourse[]> {
  // Wait for some kind of results container
  const containerSelectors = [
    '.results-list',
    '.elenco-corsi',
    '.search-results',
    'main',
  ];

  for (const sel of containerSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 10000 });
      break;
    } catch {
      // try next selector
    }
  }

  const courses = await page.evaluate<ItalyCourse[]>(() => {
    const baseUrl = window.location.origin;

    const normalizeUrl = (href: string | null) => {
      if (!href) return null;
      if (href.startsWith('http://') || href.startsWith('https://')) return href;
      if (!href.startsWith('/')) href = '/' + href;
      return baseUrl + href;
    };

    const cards = Array.from(
      document.querySelectorAll(
        '.results-list .result-item, .elenco-corsi .corso, .search-results .result-item, article, .card'
      )
    );

    const data: ItalyCourse[] = [];

    for (const card of cards as HTMLElement[]) {
      const titleEl =
        card.querySelector<HTMLElement>('h3, h2, .course-title, .titolo-corso') ||
        card.querySelector<HTMLElement>('a');

      const uniEl =
        card.querySelector<HTMLElement>('.university, .ateneo, .provider, .nome-ateneo') ||
        card.querySelector<HTMLElement>('p');

      const metaText = card.innerText || '';

      // Heuristic extraction from text for degree type, duration, language
      let degreeType = '';
      if (/Triennale/i.test(metaText)) degreeType = 'Bachelor (Triennale)';
      else if (/Magistrale/i.test(metaText)) degreeType = 'Master (Magistrale)';

      let duration = '';
      const durationMatch = metaText.match(/(\d+)\s*(year|years|anno|anni)/i);
      if (durationMatch) {
        duration = durationMatch[0];
      }

      let language = '';
      if (/\bEN\b|English/i.test(metaText)) language = 'English';
      else if (/\bIT\b|Italian/i.test(metaText)) language = 'Italian';

      const linkEl =
        card.querySelector<HTMLAnchorElement>('a[href*="/corsi/"], a[href*="cerca-corsi"], a[href]');

      const courseName = titleEl ? titleEl.textContent?.trim() ?? '' : '';
      const universityName = uniEl ? uniEl.textContent?.trim() ?? '' : '';
      const href = linkEl ? linkEl.getAttribute('href') : null;

      if (!courseName || !href) continue;

      data.push({
        courseName,
        universityName,
        degreeType,
        duration,
        language,
        link: normalizeUrl(href),
      });
    }

    return data;
  });

  return courses;
}

async function paginateAndScrape(page: Page, maxPages = 5): Promise<ItalyCourse[]> {
  const all: ItalyCourse[] = [];

  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
    console.log(`Scraping page ${pageIndex}`);
    const pageCourses = await scrapePageCourses(page);
    console.log(`  Found ${pageCourses.length} courses on this page`);
    all.push(...pageCourses);

    // Try to click a "Next" pagination button
    const nextSelectors = [
      'a[rel="next"]',
      'button[rel="next"]',
      'a.page-link.next',
      'button.page-link.next',
      'a:contains("Next")',
    ];

    let clicked = false;
    for (const sel of nextSelectors) {
      const handle = await page.$(sel as any).catch(() => null);
      if (handle) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
          (handle as any).click(),
        ]);
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      console.log('No Next button found; stopping pagination');
      break;
    }
  }

  // De-duplicate by course name + university + link
  const seen = new Set<string>();
  const unique: ItalyCourse[] = [];
  for (const c of all) {
    const key = `${c.courseName}|${c.universityName}|${c.link}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }

  return unique;
}

async function main() {
  const browser: Browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    await goToEnglishHome(page);
    await openCourseSearch(page);
    await applyEnglishFilter(page);

    const courses = await paginateAndScrape(page, 5);
    console.log(`Total unique courses scraped: ${courses.length}`);

    const outPath = path.resolve('src', 'data', 'italy-courses.json');
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    fs.writeFileSync(outPath, JSON.stringify(courses, null, 2), 'utf8');
    console.log('Saved data to', outPath);
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error('Universitaly scrape failed:', err);
  process.exit(1);
});
