'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NavbarNext from '../../components/NavbarNext';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import type { JobOpportunity } from '../../lib/database.types';

export default function JobsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F7FB]" />}>
      <JobsPageInner />
    </Suspense>
  );
}

function JobsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [jobs, setJobs] = useState<JobOpportunity[] | null>(null);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);

  const currentPage = useMemo(() => {
    const raw = searchParams.get('page');
    const parsed = raw ? Number(raw) : 1;
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.floor(parsed);
  }, [searchParams]);

  const ITEMS_PER_PAGE = 20;
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

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
        .or('type.eq.JOB,isJob.eq.true')
        .order('postedAt', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('Failed to load jobs', error);
        setError('Failed to load opportunities. Please try again later.');
      } else {
        setJobs((data as JobOpportunity[]) ?? null);
        setTotalCount(count ?? 0);
      }

      setLoading(false);
    }

    void loadJobs();
  }, [currentPage]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  const filtered = useMemo(() => {
    if (!jobs) return [] as JobOpportunity[];
    const normalizedQuery = query.trim().toLowerCase();
    return jobs.filter((job) => {
      const text = `${job.title ?? ''} ${job.company ?? ''} ${job.city ?? ''} ${job.country ?? ''} ${job.description ?? ''}`
        .toString()
        .toLowerCase();

      if (normalizedQuery && !text.includes(normalizedQuery)) {
        return false;
      }

      if (remoteOnly) {
        const remoteText = `${job.city ?? ''} ${job.country ?? ''} ${job.title ?? ''} ${job.description ?? ''}`
          .toString()
          .toLowerCase();
        if (!remoteText.includes('remote')) {
          return false;
        }
      }

      return true;
    });
  }, [jobs, query, remoteOnly]);

  const goToPage = (page: number) => {
    const next = Math.min(Math.max(page, 1), totalPages);
    router.push(`/jobs?page=${next}`);
  };

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <NavbarNext />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <header className="mb-6 sticky top-16 z-20 bg-[#F5F7FB] pb-3">
          <h1 className="text-3xl font-bold text-[#002147] mb-2">Jobs</h1>
          <p className="text-gray-600 max-w-2xl text-sm">
            Curated industry and remote-friendly roles collected by the job hunter bot. Newest opportunities appear first.
          </p>
        </header>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, company, or location..."
            className="w-full md:max-w-sm px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#002147] focus:border-transparent bg-white"
          />
          <label className="inline-flex items-center text-xs text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 text-[#FF9900] border-gray-300 rounded focus:ring-[#FF9900] mr-2"
              checked={remoteOnly}
              onChange={(e) => setRemoteOnly(e.target.checked)}
            />
            Remote only
          </label>
        </div>

        {loading && <p className="text-gray-600 text-sm">Loading opportunities…</p>}

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {!loading && !error && (!jobs || jobs.length === 0) && (
          <p className="text-gray-600 text-sm">
            No industry jobs have been synced yet. The engine will populate this list automatically after the next sync.
          </p>
        )}

        {!loading && !error && jobs && jobs.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3 text-xs text-gray-600">
              <span>
                Showing {filtered.length} jobs (out of {totalCount} stored)
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
                <span className="px-2 text-gray-600">
                  Page {currentPage} of {totalPages}
                </span>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {filtered.map((job) => {
                const hasCompany = job.company && job.company !== 'Unknown';
                const hasCity = job.city && job.city !== 'Unknown';
                const hasCountry = job.country && job.country !== 'Unknown';

                return (
                  <article
                    key={job.id}
                    onClick={() => router.push(`/jobs/${job.id}`)}
                    className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col justify-between cursor-pointer"
                  >
                    <div>
                      <h2 className="text-lg font-semibold text-[#002147] mb-1">{job.title}</h2>
                      {hasCompany && <p className="text-sm text-gray-700 mb-1">{job.company}</p>}
                      {(hasCity || hasCountry) && (
                        <p className="text-xs text-gray-500 mb-1">
                          {[hasCity ? job.city : null, hasCountry ? job.country : null]
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                      )}

                      <div className="text-xs text-gray-600 space-y-1 mt-2">
                        <p>
                          <span className="font-medium">Type:</span> Industry job
                        </p>
                        <p>
                          <span className="font-medium">Posted:</span> {new Date(job.postedAt).toLocaleDateString()}
                        </p>
                      </div>

                      {job.requirements && job.requirements.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-gray-700 mb-1">Key requirements:</p>
                          <ul className="list-disc list-inside text-[11px] text-gray-600 space-y-0.5">
                            {job.requirements.slice(0, 5).map((req, idx) => (
                              <li key={idx}>{req}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex justify-between items-center">
                      <a
                        href={job.applicationLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-md bg-[#FF9900] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#e68a00] transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Apply on website
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-4 text-xs text-gray-600">
              <span>
                Showing {filtered.length} jobs (out of {totalCount} stored)
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
                <span className="px-2 text-gray-600">
                  Page {currentPage} of {totalPages}
                </span>
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
      </main>
    </div>
  );
}
