// Scrapes course data from Universitaly and saves it to src/data/italy-courses.json
// Usage: node scripts/scrape-italy.js

import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

// __dirname replacement for ES modules
const __dirname = path.dirname(new URL(import.meta.url).pathname);

async function scrape() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  const baseUrl = 'https://www.universitaly.it';
  const searchUrl = `${baseUrl}/cerca-corsi`;

  console.log('Navigating to', searchUrl);
  await page.goto(searchUrl, { waitUntil: 'networkidle2' });

  try {
    // Click ENG button to switch to English, if present
    const engSelectorCandidates = [
      'button[lang="en"]',
      'a[lang="en"]',
      'button:has-text("ENG")',
    ];

    let engClicked = false;
    for (const sel of engSelectorCandidates) {
      const el = await page.$(sel).catch(() => null);
      if (el) {
        console.log('Clicking ENG button via selector:', sel);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
          el.click(),
        ]);
        engClicked = true;
        break;
      }
    }

    if (!engClicked) {
      console.warn('ENG toggle not found; continuing with current language');
    }
  } catch (e) {
    console.warn('Error while trying to switch language:', e.message);
  }

  // Wait for course results container to appear
  // NOTE: selector may need adjustment if Universitaly changes its layout.
  const resultSelector = '.results-list, .search-results, .elenco-corsi, .risultati';

  console.log('Waiting for course results to load...');
  await page.waitForSelector(resultSelector, { timeout: 30000 }).catch(() => {
    console.warn('Course results container not found with generic selectors; proceeding anyway');
  });

  // Try to select individual course items
  const courseItemsSelector =
    '.results-list .result-item, .search-results .result-item, .elenco-corsi .corso, .risultati .corso';

  const courses = await page.evaluate(
    (itemsSelector, base) => {
      const items = Array.from(document.querySelectorAll(itemsSelector));
      if (!items.length) {
        console.warn('No course items matched; attempting fallback selector');
      }

      const normalizeUrl = (href) => {
        if (!href) return null;
        if (href.startsWith('http://') || href.startsWith('https://')) return href;
        if (!href.startsWith('/')) href = '/' + href;
        return base + href;
      };

      const data = items.map((el) => {
        const titleEl =
          el.querySelector('h3, h2, .course-title, .titolo-corso') ||
          el.querySelector('a');
        const uniEl =
          el.querySelector('.university, .ateneo, .provider, .nome-ateneo') ||
          el.querySelector('p');
        const linkEl = el.querySelector('a');

        const courseName = titleEl ? titleEl.textContent.trim() : '';
        const universityName = uniEl ? uniEl.textContent.trim() : '';
        const href = linkEl ? linkEl.getAttribute('href') : null;

        return {
          courseName,
          universityName,
          link: normalizeUrl(href),
        };
      });

      // Fallback: if no items detected via complex selector, try all links under results area
      if (!data.length) {
        const container =
          document.querySelector('.results-list, .search-results, .elenco-corsi, .risultati') ||
          document.body;
        const links = Array.from(container.querySelectorAll('a'));
        return links
          .map((a) => ({
            courseName: a.textContent.trim(),
            universityName: '',
            link: normalizeUrl(a.getAttribute('href')),
          }))
          .filter((c) => c.courseName && c.link);
      }

      return data;
    },
    courseItemsSelector,
    baseUrl
  );

  console.log(`Scraped ${courses.length} courses`);

  const outPath = path.resolve(__dirname, '..', 'src', 'data', 'italy-courses.json');
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outPath, JSON.stringify(courses, null, 2), 'utf8');
  console.log('Saved data to', outPath);

  await browser.close();
}

scrape().catch((err) => {
  console.error('Scrape failed:', err);
  process.exit(1);
});
