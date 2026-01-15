'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
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

  const [jobs, setJobs] = useState<JobOpportunity[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);

  const currentPage = useMemo(() => {
    const raw = searchParams.get('page');
    const parsed = raw ? Number(raw) : 1;
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.floor(parsed);
  }, [searchParams]);

  const ITEMS_PER_PAGE = 20;
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

  const keywordChips = ['AI / Data', 'Robotics', 'Climate', 'Europe', 'Remote'];

  useEffect(() => {
    async function loadJobs() {
      if (!isSupabaseConfigured) {
        setError('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error, count } = await supabase
        .from('JobOpportunity')
        .select('*', { count: 'exact' })
        .or('type.eq.PHD,isPhd.eq.true')
        .order('postedAt', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('Failed to load PhD positions', error);
        setError('Failed to load PhD positions. Please try again later.');
      } else {
        setJobs((data as JobOpportunity[]) || []);
        setTotalCount(count ?? 0);
      }

      setLoading(false);
    }

    void loadJobs();
  }, [currentPage]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  const goToPage = (page: number) => {
    const next = Math.min(Math.max(page, 1), totalPages);
    router.push(`/phd?page=${next}`);
  };

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

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <NavbarNext />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#002147] mb-2">PhD Positions</h1>
            <p className="text-gray-600 text-sm max-w-2xl">
              Curated doctoral and PhD opportunities from leading universities and research institutes.
            </p>
          </div>

          <div className="w-full md:w-80 flex items-center bg-white rounded-lg shadow-sm px-3 py-2 border border-gray-200">
            <Search className="h-4 w-4 text-gray-400 mr-2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, institution, or topic..."
              className="w-full text-sm outline-none border-none bg-transparent"
            />
          </div>
        </div>

        {!loading && !error && totalCount > 0 && (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
            <div className="text-xs text-gray-600">
              Page {currentPage} of {totalPages} (total stored: {totalCount})
            </div>

            <nav className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-8 px-3 rounded border bg-white text-xs disabled:opacity-50"
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
                    onClick={() => goToPage(p)}
                    className={`h-8 w-8 rounded border text-xs ${
                      p === currentPage ? 'bg-[#002147] text-white border-[#002147]' : 'bg-white text-gray-700'
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}

              <button
                type="button"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="h-8 px-3 rounded border bg-white text-xs disabled:opacity-50"
              >
                Next
              </button>
            </nav>
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-lg shadow-md p-6 text-sm text-gray-600">Loading PhD positions…</div>
        )}

        {error && !loading && (
          <div className="bg-white rounded-lg shadow-md p-6 text-sm text-red-600 mb-4">{error}</div>
        )}

        {!loading && !error && jobs.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 text-sm text-gray-600">
            No PhD positions have been synced yet. The engine will populate this list automatically after the next sync.
          </div>
        )}

        {!loading && !error && jobs.length > 0 && (
          <>
            <PhdResults
              jobs={jobs}
              query={query}
              selectedCountries={selectedCountries}
              setSelectedCountries={setSelectedCountries}
              activeKeyword={activeKeyword}
              setActiveKeyword={setActiveKeyword}
              keywordChips={keywordChips}
              onNavigate={(to) => router.push(to)}
            />

            {!loading && !error && totalCount > 0 && (
              <nav className="flex items-center justify-center gap-1 mt-8">
                <button
                  type="button"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="h-8 px-3 rounded border bg-white text-xs disabled:opacity-50"
                >
                  Prev
                </button>

                {pageItems.map((p, idx) =>
                  p === null ? (
                    <span key={`ellipsis-bottom-${idx}`} className="px-2 text-xs text-gray-500">
                      …
                    </span>
                  ) : (
                    <button
                      key={`bottom-${p}`}
                      type="button"
                      onClick={() => goToPage(p)}
                      className={`h-8 w-8 rounded border text-xs ${
                        p === currentPage ? 'bg-[#002147] text-white border-[#002147]' : 'bg-white text-gray-700'
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}

                <button
                  type="button"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="h-8 px-3 rounded border bg-white text-xs disabled:opacity-50"
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface PhdResultsProps {
  jobs: JobOpportunity[];
  query: string;
  selectedCountries: string[];
  setSelectedCountries: React.Dispatch<React.SetStateAction<string[]>>;
  activeKeyword: string | null;
  setActiveKeyword: React.Dispatch<React.SetStateAction<string | null>>;
  keywordChips: string[];
  onNavigate: (to: string) => void;
}

function PhdResults({
  jobs,
  query,
  selectedCountries,
  setSelectedCountries,
  activeKeyword,
  setActiveKeyword,
  keywordChips,
  onNavigate,
}: PhdResultsProps) {
  const availableCountries = [
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

  const filtered = (() => {
    let list = [...jobs];

    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) {
      list = list.filter((job) => {
        const text = `${job.title ?? ''} ${job.company ?? ''} ${job.city ?? ''} ${job.country ?? ''} ${job.description ?? ''}`
          .toString()
          .toLowerCase();
        return text.includes(normalizedQuery);
      });
    }

    if (selectedCountries.length > 0) {
      list = list.filter((job) => {
        const c = (job.country || '').toString().trim();
        return c && selectedCountries.includes(c);
      });
    }

    if (activeKeyword) {
      const kw = activeKeyword.toLowerCase();
      list = list.filter((job) => {
        const text = `${job.title ?? ''} ${job.description ?? ''}`.toString().toLowerCase();

        if (kw.includes('ai')) {
          return /ai|artificial intelligence|machine learning|data science/.test(text);
        }
        if (kw.includes('robot')) {
          return /robot|robotics|autonomous system|autonomous vehicle/.test(text);
        }
        if (kw.includes('climate')) {
          return /climate|sustainability|environment|energy/.test(text);
        }
        if (kw.includes('europe')) {
          return /europe|european|germany|italy|france|spain|netherlands|sweden|norway|denmark|austria|switzerland|uk/.test(
            text,
          );
        }
        if (kw.includes('remote')) {
          return /remote/.test(text);
        }

        return true;
      });
    }

    return list;
  })();

  const handleCountryToggle = (country: string) => {
    setSelectedCountries((prev) => (prev.includes(country) ? prev.filter((c) => c !== country) : [...prev, country]));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-1">
        <div className="bg-white rounded-lg shadow-md p-6 sticky top-6">
          <div className="flex items-center mb-4">
            <Search className="h-5 w-5 text-[#002147] mr-2" />
            <h2 className="text-lg font-semibold text-[#002147]">Filters</h2>
          </div>

          <div className="mb-6">
            <h3 className="font-semibold text-[#002147] mb-3">Country</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {availableCountries.map((country) => (
                <label key={country} className="flex items-center cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selectedCountries.includes(country)}
                    onChange={() => handleCountryToggle(country)}
                    className="w-4 h-4 text-[#FF9900] border-gray-300 rounded focus:ring-[#FF9900]"
                  />
                  <span className="ml-2 text-gray-700">{country}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <h3 className="font-semibold text-[#002147] mb-3">Topics</h3>
            <div className="flex flex-wrap gap-2">
              {keywordChips.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActiveKeyword((current) => (current === label ? null : label))}
                  className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
                    activeKeyword === label
                      ? 'bg-[#002147] text-white border-[#002147]'
                      : 'bg-white text-[#002147] border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedCountries([]);
              setActiveKeyword(null);
            }}
            className="w-full text-sm text-[#FF9900] hover:text-[#e68a00] font-medium mt-2"
          >
            Clear All Filters
          </button>
        </div>
      </div>

      <div className="lg:col-span-3">
        <div className="flex items-center justify-between mb-4 text-sm text-gray-600">
          <p>
            Found {filtered.length} PhD position{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-600 text-sm">
            No PhD positions match your current filters. Try adjusting your search.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((job) => (
              <div
                key={job.id}
                className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200"
              >
                <div className="p-5">
                  <h3 className="text-lg md:text-xl font-semibold text-[#002147] leading-snug mb-1">
                    {job.title}
                  </h3>

                  <p className="text-sm font-semibold text-red-600 mb-3">
                    {(() => {
                      const institution = !isTba(job.company) ? job.company : getDomain(job.applicationLink);
                      const dept = !isTba(job.department) ? job.department : null;
                      if (institution && dept) return `${institution} > ${dept}`;
                      if (institution) return institution;
                      if (dept) return dept;
                      return null;
                    })()}
                  </p>

                  <div
                    className="text-sm text-gray-700 overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]"
                  >
                    {job.card_summary && job.card_summary !== 'TBA' ? (
                      job.card_summary
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{job.description}</ReactMarkdown>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 border-t border-gray-200 px-5 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-700">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border">
                      📅 {job.deadline ? new Date(job.deadline).toLocaleDateString() : 'TBD'}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border">
                      🎓 PhD
                    </span>
                    {!isTba(job.funding_status) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border">
                        💰 {job.funding_status}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigate(`/phd/${job.id}`)}
                    className="inline-flex items-center justify-center rounded-md bg-[#FF5A1F] hover:bg-[#e14b1c] text-white text-xs font-semibold px-4 py-2"
                  >
                    More details &gt;
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
