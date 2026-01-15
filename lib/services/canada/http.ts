import { looksBlocked, looksLikeLoginWall } from './content';
import type { CanadaFetchResult, CanadaFetchStatus } from './types';
import { HostBackoff, HostRateLimiter } from './rateLimit';
import { isBlacklistedHost } from './policy';
import { isAllowedByRobots } from './robots';

const DEFAULT_UA =
  'StudyPortalBot/1.0 (+https://studyportal.local) Mozilla/5.0 (compatible; StudyPortalBot/1.0)';

export type ConditionalHeaders = {
  etag: string | null;
  lastModified: string | null;
};

export type FetchPageArgs = {
  url: string;
  canonicalUrl: string;
  timeoutMs: number;
  minDelayMs: number;
  maxBytes: number;
  conditional: ConditionalHeaders;
  respectRobots: boolean;
};

export class CanadaHttpClient {
  private readonly limiterByHost = new Map<string, HostRateLimiter>();
  private readonly backoff = new HostBackoff(1500, 60_000);

  constructor(private readonly userAgent: string = DEFAULT_UA) {}

  private getLimiter(host: string, minDelayMs: number) {
    const existing = this.limiterByHost.get(host);
    if (existing) return existing;
    const limiter = new HostRateLimiter(minDelayMs);
    this.limiterByHost.set(host, limiter);
    return limiter;
  }

  async fetchPage(args: FetchPageArgs): Promise<CanadaFetchResult> {
    const started = Date.now();

    if (isBlacklistedHost(args.url)) {
      return {
        status: 'BLOCKED',
        fetchedUrl: args.url,
        canonicalUrl: args.canonicalUrl,
        httpStatus: null,
        elapsedMs: 0,
        responseBytes: null,
        etag: null,
        lastModified: null,
        bodyText: null,
        blockedReason: 'blacklisted_host',
        errorMessage: null,
      };
    }

    if (args.respectRobots) {
      const ok = await isAllowedByRobots({ url: args.url, userAgent: this.userAgent });
      if (!ok) {
        return {
          status: 'BLOCKED',
          fetchedUrl: args.url,
          canonicalUrl: args.canonicalUrl,
          httpStatus: 403,
          elapsedMs: 0,
          responseBytes: null,
          etag: null,
          lastModified: null,
          bodyText: null,
          blockedReason: 'robots_disallow',
          errorMessage: null,
        };
      }
    }
    const host = (() => {
      try {
        return new URL(args.url).hostname;
      } catch {
        return 'unknown';
      }
    })();

    await this.backoff.wait(host);
    await this.getLimiter(host, args.minDelayMs).wait(host);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), args.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'User-Agent': this.userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      };

      if (args.conditional.etag) headers['If-None-Match'] = args.conditional.etag;
      if (args.conditional.lastModified) headers['If-Modified-Since'] = args.conditional.lastModified;

      const res = await fetch(args.url, { headers, redirect: 'follow', signal: controller.signal });
      const elapsedMs = Date.now() - started;

      const httpStatus = res.status;
      const etag = res.headers.get('etag');
      const lastModified = res.headers.get('last-modified');

      if (httpStatus === 304) {
        return {
          status: 'NOT_MODIFIED',
          fetchedUrl: res.url || args.url,
          canonicalUrl: args.canonicalUrl,
          httpStatus,
          elapsedMs,
          responseBytes: 0,
          etag,
          lastModified,
          bodyText: null,
          blockedReason: null,
          errorMessage: null,
        };
      }

      const bytes = await res.arrayBuffer();
      const responseBytes = bytes.byteLength;

      const status: CanadaFetchStatus = res.ok ? 'OK' : httpStatus === 403 || httpStatus === 429 ? 'BLOCKED' : 'ERROR';

      if (status === 'BLOCKED') {
        this.backoff.penalize(host, 2.0);
      }

      if (responseBytes > args.maxBytes) {
        return {
          status: 'ERROR',
          fetchedUrl: res.url || args.url,
          canonicalUrl: args.canonicalUrl,
          httpStatus,
          elapsedMs,
          responseBytes,
          etag,
          lastModified,
          bodyText: null,
          blockedReason: null,
          errorMessage: `Response too large (${responseBytes} bytes)`,
        };
      }

      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

      if (looksBlocked(text) || looksLikeLoginWall(text)) {
        this.backoff.penalize(host, 2.0);
        return {
          status: 'BLOCKED',
          fetchedUrl: res.url || args.url,
          canonicalUrl: args.canonicalUrl,
          httpStatus,
          elapsedMs,
          responseBytes,
          etag,
          lastModified,
          bodyText: null,
          blockedReason: looksBlocked(text) ? 'blocked_content' : 'login_wall',
          errorMessage: null,
        };
      }

      if (!res.ok) {
        return {
          status,
          fetchedUrl: res.url || args.url,
          canonicalUrl: args.canonicalUrl,
          httpStatus,
          elapsedMs,
          responseBytes,
          etag,
          lastModified,
          bodyText: null,
          blockedReason: status === 'BLOCKED' ? 'http_blocked' : null,
          errorMessage: `HTTP ${httpStatus}`,
        };
      }

      return {
        status: 'OK',
        fetchedUrl: res.url || args.url,
        canonicalUrl: args.canonicalUrl,
        httpStatus,
        elapsedMs,
        responseBytes,
        etag,
        lastModified,
        bodyText: text,
        blockedReason: null,
        errorMessage: null,
      };
    } catch (e) {
      const elapsedMs = Date.now() - started;
      return {
        status: 'ERROR',
        fetchedUrl: args.url,
        canonicalUrl: args.canonicalUrl,
        httpStatus: null,
        elapsedMs,
        responseBytes: null,
        etag: null,
        lastModified: null,
        bodyText: null,
        blockedReason: null,
        errorMessage: e instanceof Error ? e.message : 'Unknown error',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
