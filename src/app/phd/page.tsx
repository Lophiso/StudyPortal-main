'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import NavbarNext from '../../components/NavbarNext';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import type { JobOpportunity } from '../../lib/database.types';

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
          <div className="flex items-center justify-between mb-4 text-xs text-gray-600">
            <span>
              Page {currentPage} of {totalPages} (total stored: {totalCount})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1 border rounded disabled:opacity-50 bg-white"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border rounded disabled:opacity-50 bg-white"
              >
                Next
              </button>
            </div>
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

            <div className="flex items-center justify-between mt-6 text-xs text-gray-600">
              <span>
                Page {currentPage} of {totalPages} (total stored: {totalCount})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border rounded disabled:opacity-50 bg-white"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border rounded disabled:opacity-50 bg-white"
                >
                  Next
                </button>
              </div>
            </div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filtered.map((job) => (
              <div
                key={job.id}
                className="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow duration-200 overflow-hidden cursor-pointer"
                onClick={() => onNavigate(`/phd/${job.id}`)}
              >
                <div className="p-6 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-3">
                    <span className="inline-block px-3 py-1 text-xs font-semibold text-white bg-[#002147] rounded-full">
                      PhD
                    </span>
                    <div className="text-right text-xs text-gray-600 space-y-1">
                      {job.deadline && (
                        <p>
                          <span className="font-semibold">Deadline:</span> {new Date(job.deadline).toLocaleDateString()}
                        </p>
                      )}
                      <p>
                        <span className="font-semibold">Posted:</span> {new Date(job.postedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-[#002147] mb-2 line-clamp-2">{job.title}</h3>

                  {job.company && job.company !== 'Unknown' && (
                    <p className="text-gray-700 font-medium mb-2 text-sm">{job.company}</p>
                  )}

                  <p className="text-gray-600 text-sm line-clamp-3 mb-4">{job.description}</p>

                  <button className="mt-auto w-full bg-[#FF9900] hover:bg-[#e68a00] text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200">
                    View Details
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
