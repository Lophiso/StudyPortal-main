import { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import { supabase } from '../lib/supabase';
import type { JobOpportunity } from '../lib/database.types';

export default function Jobs() {
  const [jobs, setJobs] = useState<JobOpportunity[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const pageSize = 12;

  useEffect(() => {
    async function loadJobs() {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('JobOpportunity')
        .select('*')
        .eq('type', 'JOB')
        .order('postedAt', { ascending: false });

      if (error) {
        console.error('Failed to load jobs', error);
        setError('Failed to load opportunities. Please try again later.');
      } else {
        setJobs(data as JobOpportunity[]);
      }
      setLoading(false);
    }

    void loadJobs();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [jobs, query, remoteOnly]);

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-[#002147] mb-2">Jobs</h1>
          <p className="text-gray-600 max-w-2xl text-sm">
            Curated industry and remote-friendly roles collected by the job hunter bot.
            Newest opportunities appear first, and older ones remain accessible as long
            as they stay in the database.
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

        {loading && (
          <p className="text-gray-600 text-sm">Loading opportunities…</p>
        )}

        {error && (
          <p className="text-sm text-red-600 mb-4">{error}</p>
        )}

        {!loading && !error && (!jobs || jobs.length === 0) && (
          <p className="text-gray-600 text-sm">
            No industry jobs have been synced yet. The engine will populate this
            list automatically after the next sync.
          </p>
        )}

        {!loading && !error && jobs && jobs.length > 0 && (
          (() => {
            const normalizedQuery = query.trim().toLowerCase();
            const filtered = jobs.filter((job) => {
              const text = `${job.title ?? ''} ${job.company ?? ''} ${job.city ?? ''} ${
                job.country ?? ''
              } ${job.description ?? ''}`
                .toString()
                .toLowerCase();

              if (normalizedQuery && !text.includes(normalizedQuery)) {
                return false;
              }

              if (remoteOnly) {
                const remoteText = `${job.city ?? ''} ${job.country ?? ''} ${job.title ?? ''} ${
                  job.description ?? ''
                }`
                  .toString()
                  .toLowerCase();
                if (!remoteText.includes('remote')) {
                  return false;
                }
              }

              return true;
            });

            const totalPages = Math.ceil(filtered.length / pageSize) || 1;
            const currentPage = Math.min(Math.max(page, 1), totalPages);
            const start = (currentPage - 1) * pageSize;
            const end = start + pageSize;
            const visible = filtered.slice(start, end);

            return (
              <>
                <div className="flex items-center justify-between mb-3 text-xs text-gray-600">
                  <span>
                    Showing
                    {filtered.length === 0
                      ? ' 0'
                      : ` ${start + 1}-${Math.min(end, filtered.length)}`}{' '}
                    of {filtered.length} jobs
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className={`px-2 py-1 rounded border text-xs font-medium transition-colors ${
                        currentPage === 1
                          ? 'border-gray-200 text-gray-300 cursor-default'
                          : 'border-gray-300 text-[#002147] hover:bg-gray-50'
                      }`}
                    >
                      Previous
                    </button>
                    <span>
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className={`px-2 py-1 rounded border text-xs font-medium transition-colors ${
                        currentPage === totalPages
                          ? 'border-gray-200 text-gray-300 cursor-default'
                          : 'border-gray-300 text-[#002147] hover:bg-gray-50'
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {visible.map((job) => (
              <article
                key={job.id}
                className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col justify-between"
              >
                <div>
                  <h2 className="text-lg font-semibold text-[#002147] mb-1">
                    {job.title}
                  </h2>
                  <p className="text-sm text-gray-700 mb-1">{job.company}</p>
                  <p className="text-xs text-gray-500 mb-1">
                    {job.city}, {job.country}
                  </p>

                  <div className="text-xs text-gray-600 space-y-1 mt-2">
                    <p>
                      <span className="font-medium">Type:</span> Industry job
                    </p>
                    <p>
                      <span className="font-medium">Posted:</span>{' '}
                      {new Date(job.postedAt).toLocaleDateString()}
                    </p>
                  </div>

                  {job.requirements && job.requirements.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-gray-700 mb-1">
                        Key requirements:
                      </p>
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
                  >
                    Apply on website
                  </a>
                </div>
              </article>
                  ))}
                </div>
              </>
            );
          })()
        )}
      </main>
    </div>
  );
}
