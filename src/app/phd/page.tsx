'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Filter, Search, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import NavbarNext from '../../components/NavbarNext';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import type { JobOpportunity } from '../../lib/database.types';

function isTba(value?: string | null) {
  const v = (value ?? '').toString().trim();
  return !v || v.toLowerCase() === 'tba' || v.toLowerCase() === 'unknown';
}

function getDomain(url?: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function isRubbishTitle(title?: string | null) {
  const t = (title ?? '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return true;
  return (
    t.startsWith('find your ideal') ||
    t.startsWith('find your next') ||
    t.startsWith('sign up for instagram') ||
    t.startsWith('log in') ||
    (t.includes('sign up') && t.includes('instagram')) ||
    t.includes('join instagram') ||
    t.includes('facebook.com') ||
    t.includes('instagram.com') ||
    t.includes('twitter.com') ||
    t.includes('x.com')
  );
}

function isBlacklistedHost(url?: string | null) {
  if (!url) return false;
  const host = getDomain(url)?.toLowerCase();
  if (!host) return false;
  return (
    host === 'instagram.com' ||
    host.endsWith('.instagram.com') ||
    host === 'facebook.com' ||
    host.endsWith('.facebook.com') ||
    host === 'm.facebook.com' ||
    host === 'twitter.com' ||
    host.endsWith('.twitter.com') ||
    host === 'x.com' ||
    host.endsWith('.x.com')
  );
}

function faviconUrl(targetUrl: string) {
  const host = getDomain(targetUrl) || '';
  const safeHost = host.replace(/\s+/g, '').trim();
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(safeHost)}&sz=128`;
}

function recordHomeContext(kind: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('sp_home_context', JSON.stringify({ kind, ts: Date.now() }));
  } catch {
    return;
  }
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/70 shadow-sm overflow-hidden">
      <div className="p-5 animate-pulse">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-200" />
          <div className="flex-1">
            <div className="h-4 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-200 rounded w-1/2 mt-3" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-3 bg-slate-200 rounded w-full" />
          <div className="h-3 bg-slate-200 rounded w-11/12" />
          <div className="h-3 bg-slate-200 rounded w-10/12" />
        </div>
        <div className="mt-4 flex gap-2">
          <div className="h-6 w-20 bg-slate-200 rounded-full" />
          <div className="h-6 w-16 bg-slate-200 rounded-full" />
          <div className="h-6 w-24 bg-slate-200 rounded-full" />
        </div>
      </div>
      <div className="h-12 bg-slate-50 border-t border-slate-200/60" />
    </div>
  );
}

type FilterGroup = {
  id: string;
  countries: string[];
  topics: string[];
  funding: string[];
};

function createEmptyGroup(): FilterGroup {
  return {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    countries: [],
    topics: [],
    funding: [],
  };
}

function toggleInList(list: string[], value: string) {
  if (list.includes(value)) return list.filter((v) => v !== value);
  return [...list, value];
}

function groupMatches(job: JobOpportunity, group: FilterGroup) {
  const countryOk =
    group.countries.length === 0 || group.countries.includes((job.country ?? '').toString().trim());

  const haystack = `${job.title ?? ''} ${job.company ?? ''} ${job.department ?? ''} ${job.funding_status ?? ''} ${job.description ?? ''} ${job.card_summary ?? ''}`
    .toString()
    .toLowerCase();

  const topicOk =
    group.topics.length === 0 ||
    group.topics.some((t) => {
      const needle = t.toLowerCase();
      if (needle.includes('ai')) return /ai|artificial intelligence|machine learning|data science/.test(haystack);
      if (needle.includes('robot')) return /robot|robotics|autonomous system|autonomous vehicle/.test(haystack);
      if (needle.includes('climate')) return /climate|sustainability|environment|energy/.test(haystack);
      if (needle.includes('europe')) {
        return /europe|european|germany|italy|france|spain|netherlands|sweden|norway|denmark|austria|switzerland|uk/.test(
          haystack,
        );
      }
      if (needle.includes('remote')) return /remote/.test(haystack);
      return haystack.includes(needle);
    });

  const fundingValue = (job.funding_status ?? 'TBA').toString().trim() || 'TBA';
  const fundingOk = group.funding.length === 0 || group.funding.includes(fundingValue);

  return countryOk && topicOk && fundingOk;
}

export default function PhdPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F7FA]" />}>
      <PhdPageInner />
    </Suspense>
  );
}

function PhdPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [jobs, setJobs] = useState<JobOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>([createEmptyGroup()]);

  const currentPage = useMemo(() => {
    const raw = searchParams.get('page');
    const parsed = raw ? Number(raw) : 1;
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.floor(parsed);
  }, [searchParams]);

  const ITEMS_PER_PAGE = 12;
  const keywordChips = ['AI / Data', 'Robotics', 'Climate', 'Europe', 'Remote'];
  const fundingChips = ['Fully Funded', 'Partially Funded', 'Self-Funded', 'TBA'];

  useEffect(() => {
    async function loadJobs() {
      if (!isSupabaseConfigured) {
        setError('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('JobOpportunity')
        .select('*')
        .or('type.eq.PHD,isPhd.eq.true')
        .order('postedAt', { ascending: false })
        .limit(500);

      if (error) {
        console.error('Failed to load PhD positions', error);
        setError('Failed to load PhD positions. Please try again later.');
      } else {
        setJobs((data as JobOpportunity[]) || []);
      }

      setLoading(false);
    }

    void loadJobs();
  }, []);

  useEffect(() => {
    recordHomeContext('phd');
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  const goToPage = (page: number, totalPages: number) => {
    const next = Math.min(Math.max(page, 1), totalPages);
    router.push(`/phd?page=${next}`);
  };

  const availableCountries = useMemo(() => {
    return [
      'USA',
      'Canada',
      'Germany',
      'Netherlands',
      'Italy',
      'Belgium',
      'France',
      'Denmark',
      'Australia',
      'Switzerland',
      'Norway',
      'Sweden',
      'Austria',
      'Ireland',
    ];
  }, []);

  const filtered = useMemo(() => {
    let list = [...jobs];

    list = list.filter((job) => !isBlacklistedHost(job.applicationLink) && !isRubbishTitle(job.title));

    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) {
      list = list.filter((job) => {
        const text = `${job.title ?? ''} ${job.company ?? ''} ${job.city ?? ''} ${job.country ?? ''} ${job.description ?? ''}`
          .toString()
          .toLowerCase();
        return text.includes(normalizedQuery);
      });
    }

    const anyActive = filterGroups.some((g) => g.countries.length > 0 || g.topics.length > 0 || g.funding.length > 0);
    if (anyActive) {
      list = list.filter((job) => filterGroups.some((g) => groupMatches(job, g)));
    }

    return list;
  }, [jobs, query, filterGroups]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  }, [filtered.length]);

  const paged = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const pageItems = useMemo(() => {
    const pages: Array<number | null> = [];

    if (totalPages <= 7) {
      for (let p = 1; p <= totalPages; p += 1) pages.push(p);
      return pages;
    }

    pages.push(1);

    const left = Math.max(2, currentPage - 1);
    const right = Math.min(totalPages - 1, currentPage + 1);

    if (left > 2) pages.push(null);
    for (let p = left; p <= right; p += 1) pages.push(p);
    if (right < totalPages - 1) pages.push(null);

    pages.push(totalPages);
    return pages;
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (currentPage > totalPages) {
      router.push('/phd?page=1');
    }
  }, [currentPage, totalPages, router]);

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#070B12]">
      <NavbarNext />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-[clamp(1.6rem,2.7vw,2.25rem)] font-extrabold text-[#002147] dark:text-white mb-2">
              PhD Positions
            </h1>
            <p className="text-gray-600 dark:text-slate-300 text-sm max-w-2xl">
              Curated doctoral and PhD opportunities from leading universities and research institutes.
            </p>
          </div>

          <div className="w-full md:w-[420px] flex items-center gap-2">
            <div className="flex-1 flex items-center bg-white/70 dark:bg-white/10 rounded-xl shadow-sm px-3 py-2 border border-white/20">
              <Search className="h-4 w-4 text-gray-500 dark:text-white/60 mr-2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, institution, or topic..."
                className="w-full text-sm outline-none border-none bg-transparent text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-white/60"
              />
            </div>

            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-white/70 dark:bg-white/10 border border-white/20 px-4 py-2 text-sm font-semibold text-[#002147] dark:text-white hover:bg-white/80 dark:hover:bg-white/15 transition-colors"
            >
              <Filter className="h-4 w-4" />
              Filters
            </button>
          </div>
        </div>

        {!loading && !error && (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
            <div className="text-sm text-slate-700 dark:text-slate-200">
              Found <span className="font-semibold">{filtered.length}</span> position{filtered.length !== 1 ? 's' : ''}
            </div>

            <nav className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goToPage(currentPage - 1, totalPages)}
                disabled={currentPage === 1}
                className="h-9 px-3 rounded-lg border bg-white/70 dark:bg-white/10 text-xs disabled:opacity-50"
              >
                Prev
              </button>

              {pageItems.map((p, idx) =>
                p === null ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-xs text-gray-500">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => goToPage(p, totalPages)}
                    className={`h-9 w-9 rounded-lg border text-xs ${
                      p === currentPage
                        ? 'bg-[#002147] text-white border-[#002147]'
                        : 'bg-white/70 dark:bg-white/10 text-gray-700 dark:text-slate-200 border-white/20'
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}

              <button
                type="button"
                onClick={() => goToPage(currentPage + 1, totalPages)}
                disabled={currentPage === totalPages}
                className="h-9 px-3 rounded-lg border bg-white/70 dark:bg-white/10 text-xs disabled:opacity-50"
              >
                Next
              </button>
            </nav>
          </div>
        )}

        {error && !loading && (
          <div className="bg-white rounded-lg shadow-md p-6 text-sm text-red-600 mb-4">{error}</div>
        )}

        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <SkeletonCard key={idx} />
            ))}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 text-sm text-gray-600">
            No PhD positions match your current filters. Try adjusting your query.
          </div>
        )}

        {!loading && !error && paged.length > 0 && (
          <div className="flex flex-col gap-4">
            {paged.map((job) => (
              <motion.div
                key={job.id}
                initial={false}
                whileHover={reduceMotion ? undefined : { scale: 1.01 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                onMouseMove={(e) => {
                  if (reduceMotion) return;
                  const target = e.currentTarget as HTMLDivElement;
                  const rect = target.getBoundingClientRect();
                  target.style.setProperty('--mx', `${e.clientX - rect.left}px`);
                  target.style.setProperty('--my', `${e.clientY - rect.top}px`);
                }}
                className="relative rounded-2xl border border-white/20 bg-white/70 dark:bg-white/10 backdrop-blur-xl shadow-sm overflow-hidden"
                style={{
                  backgroundImage: reduceMotion
                    ? undefined
                    : 'radial-gradient(650px circle at var(--mx, 50%) var(--my, 50%), rgba(255,153,0,0.18), rgba(255,153,0,0) 45%)',
                }}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <img
                        src={faviconUrl(job.applicationLink)}
                        alt=""
                        className="h-10 w-10 rounded-xl bg-white/70 border border-white/20"
                      />
                      <div>
                        <h3 className="text-lg md:text-xl font-semibold text-[#002147] dark:text-white leading-snug">
                          <Link href={`/phd/${job.id}`} className="hover:underline" onClick={() => recordHomeContext('phd')}>
                            {job.title}
                          </Link>
                        </h3>

                        {(() => {
                          const institution = !isTba(job.company) ? job.company : getDomain(job.applicationLink);
                          const dept = !isTba(job.department) ? job.department : null;
                          const label = (() => {
                            if (institution && dept) return `${institution} · ${dept}`;
                            if (institution) return institution;
                            if (dept) return dept;
                            return null;
                          })();
                          return label ? <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{label}</p> : null;
                        })()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isTba(job.funding_status) && (
                        <span className="px-2.5 py-1 rounded-full bg-white/60 dark:bg-white/10 border border-white/20 text-xs font-semibold text-[#002147] dark:text-white">
                          {job.funding_status}
                        </span>
                      )}
                      <span className="px-2.5 py-1 rounded-full bg-white/60 dark:bg-white/10 border border-white/20 text-xs font-semibold text-[#002147] dark:text-white">
                        Deadline {job.deadline ? new Date(job.deadline).toLocaleDateString() : 'TBD'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 text-sm text-slate-700 dark:text-slate-200 overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
                    {job.card_summary && job.card_summary !== 'TBA' ? (
                      job.card_summary
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{job.description}</ReactMarkdown>
                    )}
                  </div>
                </div>

                <div className="bg-white/60 dark:bg-white/5 border-t border-white/20 px-5 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-700 dark:text-slate-200">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/70 dark:bg-white/10 border border-white/20">
                      🎓 PhD
                    </span>
                    {(() => {
                      const host = getDomain(job.applicationLink);
                      return host ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/70 dark:bg-white/10 border border-white/20">
                          🌐 {host}
                        </span>
                      ) : null;
                    })()}
                  </div>

                  <Link
                    href={`/phd/${job.id}`}
                    className="inline-flex items-center justify-center rounded-xl bg-[#FF5A1F] hover:bg-[#e14b1c] text-white text-xs font-semibold px-4 py-2 transition-colors"
                    onClick={() => recordHomeContext('phd')}
                  >
                    More details
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {filterOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setFilterOpen(false)}
              role="button"
              tabIndex={-1}
            />

            <motion.div
              initial={{ x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="absolute right-4 top-4 bottom-4 w-[min(520px,calc(100vw-2rem))] rounded-2xl border border-white/20 bg-white/80 dark:bg-[#0B1220]/90 backdrop-blur-xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/20">
                <div>
                  <div className="text-sm font-semibold text-[#002147] dark:text-white">Filters</div>
                  <div className="text-xs text-slate-600 dark:text-slate-300">OR between groups, AND within a group</div>
                </div>
                <button
                  type="button"
                  onClick={() => setFilterOpen(false)}
                  className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-white/60 dark:bg-white/10 border border-white/20"
                >
                  <X className="h-4 w-4 text-slate-700 dark:text-slate-200" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto h-full">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    {filterGroups.length} group{filterGroups.length !== 1 ? 's' : ''}
                  </div>
                  <button
                    type="button"
                    onClick={() => setFilterGroups((prev) => [...prev, createEmptyGroup()])}
                    className="text-xs font-semibold text-[#FF5A1F] hover:underline"
                  >
                    + Add OR group
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  {filterGroups.map((group, idx) => (
                    <div key={group.id} className="rounded-2xl border border-white/20 bg-white/60 dark:bg-white/5 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Group {idx + 1}</div>
                        {filterGroups.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setFilterGroups((prev) => prev.filter((g) => g.id !== group.id));
                              router.push('/phd?page=1');
                            }}
                            className="text-xs text-slate-600 dark:text-slate-300 hover:underline"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Countries</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {availableCountries.map((c) => {
                            const active = group.countries.includes(c);
                            return (
                              <button
                                key={c}
                                type="button"
                                onClick={() => {
                                  setFilterGroups((prev) =>
                                    prev.map((g) =>
                                      g.id === group.id ? { ...g, countries: toggleInList(g.countries, c) } : g,
                                    ),
                                  );
                                  router.push('/phd?page=1');
                                }}
                                className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                                  active
                                    ? 'bg-[#002147] text-white border-[#002147]'
                                    : 'bg-white/70 dark:bg-white/10 text-[#002147] dark:text-white border-white/20 hover:bg-white/80 dark:hover:bg-white/15'
                                }`}
                              >
                                {c}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Topics</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {keywordChips.map((label) => {
                            const active = group.topics.includes(label);
                            return (
                              <button
                                key={label}
                                type="button"
                                onClick={() => {
                                  setFilterGroups((prev) =>
                                    prev.map((g) =>
                                      g.id === group.id ? { ...g, topics: toggleInList(g.topics, label) } : g,
                                    ),
                                  );
                                  router.push('/phd?page=1');
                                }}
                                className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                                  active
                                    ? 'bg-[#002147] text-white border-[#002147]'
                                    : 'bg-white/70 dark:bg-white/10 text-[#002147] dark:text-white border-white/20 hover:bg-white/80 dark:hover:bg-white/15'
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Funding</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {fundingChips.map((label) => {
                            const active = group.funding.includes(label);
                            return (
                              <button
                                key={label}
                                type="button"
                                onClick={() => {
                                  setFilterGroups((prev) =>
                                    prev.map((g) =>
                                      g.id === group.id ? { ...g, funding: toggleInList(g.funding, label) } : g,
                                    ),
                                  );
                                  router.push('/phd?page=1');
                                }}
                                className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                                  active
                                    ? 'bg-[#002147] text-white border-[#002147]'
                                    : 'bg-white/70 dark:bg-white/10 text-[#002147] dark:text-white border-white/20 hover:bg-white/80 dark:hover:bg-white/15'
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterGroups([createEmptyGroup()]);
                      router.push('/phd?page=1');
                    }}
                    className="w-full rounded-xl border border-white/20 bg-white/60 dark:bg-white/10 px-4 py-2 text-sm font-semibold text-slate-800 dark:text-white"
                  >
                    Clear filters
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterOpen(false)}
                    className="w-full rounded-xl bg-[#FF5A1F] hover:bg-[#e14b1c] px-4 py-2 text-sm font-semibold text-white transition-colors"
                  >
                    Show results ({filtered.length})
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
