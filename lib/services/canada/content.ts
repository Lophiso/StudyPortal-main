import crypto from 'crypto';
import * as cheerio from 'cheerio';

export function computeContentHash(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function looksBlocked(text: string) {
  const t = text.toLowerCase();
  return (
    t.includes('sorry, you have been blocked') ||
    t.includes('access denied') ||
    t.includes('attention required') ||
    t.includes('cloudflare') ||
    (t.includes('verify you are human') && t.includes('security')) ||
    t.includes('bot detection')
  );
}

export function looksLikeLoginWall(text: string) {
  const t = text.toLowerCase();
  return (
    (t.includes('sign in') || t.includes('log in') || t.includes('login')) &&
    (t.includes('password') || t.includes('account'))
  );
}

export function extractH1(html: string) {
  const $ = cheerio.load(html);
  const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
  return h1 || null;
}

export function extractText(html: string) {
  const $ = cheerio.load(html);
  $('script,style,noscript,svg').remove();
  return $.text().replace(/\s+/g, ' ').trim();
}

export function resolveUrl(base: string, href: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}
