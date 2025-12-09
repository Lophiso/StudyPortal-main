import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function goToEnglishHome(page) {
  await page.goto('https://www.universitaly.it/', { waitUntil: 'networkidle2' });

  const langSelectors = ['a[lang="en"]', 'button[lang="en"]'];
  for (const selector of langSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
          el.click(),
        ]);
        break;
      }
    } catch {
      // ignore
    }
  }
}

async function openCourseSearch(page) {
  // In headless CI, clickable areas can be tricky; going directly to the
  // search route is more reliable than trying to click the homepage button.
  if (!page.url().includes('cerca-corsi')) {
    await page.goto('https://www.universitaly.it/cerca-corsi', {
      waitUntil: 'networkidle2',
    });
  }

  // Give the page a moment to finish any client-side setup
  await delay(2000);

  // Try to trigger the search explicitly by clicking a primary search button
  try {
    const searchButtonSelectors = [
      'button[type="submit"]',
      'button.btn-primary',
      'button.button',
      'button[title*="Search" i]',
    ];

    for (const sel of searchButtonSelectors) {
      const btn = await page.$(sel).catch(() => null);
      if (btn) {
        console.log('Clicking search button selector:', sel);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
          btn.click(),
        ]);
        break;
      }
    }
  } catch (err) {
    console.warn('Error while trying to trigger search:', err && err.message ? err.message : err);
  }
}

async function applyEnglishFilter(page) {
  try {
    const labelHandle = await page.evaluateHandle(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      return labels.find((l) => /english/i.test(l.textContent || '')) || null;
    });

    if (labelHandle) {
      await labelHandle.click();
      await page.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 }).catch(() => {});
    }
  } catch {
    // continue without filter
  }
}

async function scrapePageCourses(page) {
  // Give the page a chance to render results
  await delay(2000);

  const courses = await page.evaluate(() => {
    const baseUrl = window.location.origin;

    const normalizeUrl = (href) => {
      if (!href) return null;
      if (href.startsWith('http://') || href.startsWith('https://')) return href;
      if (!href.startsWith('/')) href = '/' + href;
      return baseUrl + href;
    };

    const data = [];

    // Primary strategy: known card containers
    const cardNodeList = document.querySelectorAll(
      '.results-list .result-item, .elenco-corsi .corso, .search-results .result-item, article, .card'
    );
    const cards = Array.from(cardNodeList);

    for (const card of cards) {
      const titleEl =
        card.querySelector('h3, h2, .course-title, .titolo-corso') ||
        card.querySelector('a');

      const uniEl =
        card.querySelector('.university, .ateneo, .provider, .nome-ateneo') ||
        card.querySelector('p');

      const metaText = card.innerText || '';

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
        card.querySelector('a[href*="/corsi/"], a[href*="cerca-corsi"], a[href]');

      const courseName = titleEl ? titleEl.textContent.trim() : '';
      const universityName = uniEl ? uniEl.textContent.trim() : '';
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

    // Fallback: if nothing matched, try all course links in the document
    if (!data.length) {
      const linkNodes = Array.from(
        document.querySelectorAll('a[href*="/corsi/"]')
      );

      for (const a of linkNodes) {
        const text = (a.textContent || '').trim();
        const href = a.getAttribute('href');
        if (!text || !href) continue;

        data.push({
          courseName: text,
          universityName: '',
          degreeType: '',
          duration: '',
          language: '',
          link: normalizeUrl(href),
        });
      }
    }

    return data;
  });

  return courses;
}

async function paginateAndScrape(page, maxPages = 5) {
  const all = [];

  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
    console.log(`Scraping page ${pageIndex}`);
    const pageCourses = await scrapePageCourses(page);
    console.log(`  Found ${pageCourses.length} courses on this page`);
    all.push(...pageCourses);

    const nextSelectors = [
      'a[rel="next"]',
      'button[rel="next"]',
      'a.page-link.next',
      'button.page-link.next',
    ];

    let clicked = false;
    for (const sel of nextSelectors) {
      const handle = await page.$(sel).catch(() => null);
      if (handle) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
          handle.click(),
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

  const seen = new Set();
  const unique = [];
  for (const c of all) {
    const key = `${c.courseName}|${c.universityName}|${c.link}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }

  return unique;
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
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
