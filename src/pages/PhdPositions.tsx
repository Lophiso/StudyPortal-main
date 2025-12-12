import { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import { supabase } from '../lib/supabase';
import type { JobOpportunity } from '../lib/database.types';

type PhdView = 'positions' | 'articles';

const ARTICLE_TITLE_KEYWORDS = [
  'how to ',
  'how do i ',
  'top ',
  'tips',
  'tricks',
  'guide',
  'the importance',
  'importance of',
  'mental health',
  'impostors',
  'impostor syndrome',
  'why ',
  'what i ',
  'on being a phd',
  'doing a phd',
  'life as a phd',
];

const ARTICLE_DOMAINS = [
  'phdlife',
  'ahappyp',
  'doctoral',
];

function getHostname(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const { hostname } = new URL(url);
    return hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isArticleLike(job: JobOpportunity): boolean {
  const title = (job.title || '').toLowerCase();
  const description = (job.description || '').toLowerCase();
  const text = `${title} ${description}`;

  if (ARTICLE_TITLE_KEYWORDS.some((kw) => text.includes(kw))) {
    return true;
  }

  const hostname = getHostname(job.applicationLink as string | null | undefined);
  if (hostname && ARTICLE_DOMAINS.some((d) => hostname.includes(d))) {
    return true;
  }

  return false;
}

function isPositionLike(job: JobOpportunity): boolean {
  return !isArticleLike(job);
}

export default function PhdPositions() {
  const [jobs, setJobs] = useState<JobOpportunity[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<PhdView>('positions');
  const [query, setQuery] = useState('');
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const keywordChips = ['AI / Data', 'Climate', 'Europe', 'Remote'];

  useEffect(() => {
    async function loadJobs() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('JobOpportunity')
        .select('*')
        .eq('type', 'PHD')
        .order('postedAt', { ascending: false });

      if (error) {
        console.error('Failed to load PhD positions', error);
        setError('Failed to load PhD positions. Please try again later.');
      } else {
        setJobs(data as JobOpportunity[]);
      }

      setLoading(false);
    }

    void loadJobs();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [view, query, activeKeyword, jobs]);

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <header className="mb-6 sticky top-16 z-20 bg-[#F5F7FB] pb-3">
          <h1 className="text-3xl font-bold text-[#002147] mb-2">PhD Positions</h1>
          <p className="text-gray-600 max-w-2xl text-sm">
            Curated doctoral and PhD opportunities from leading universities and research
            institutes. Each listing includes key details about location, deadline, and
            how to apply.
          </p>
        </header>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, institution, or topic..."
            className="w-full md:max-w-sm px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#002147] focus:border-transparent bg-white"
          />

          <div className="flex flex-wrap gap-2 text-xs">
            {keywordChips.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() =>
                  setActiveKeyword((current) => (current === label ? null : label))
                }
                className={`px-2.5 py-1 rounded-full border transition-colors ${
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

        {loading && <p className="text-gray-600 text-sm">Loading PhD positions…</p>}

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {!loading && !error && jobs && jobs.length > 0 && (
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              onClick={() => setView('positions')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                view === 'positions'
                  ? 'bg-[#002147] text-white border-[#002147]'
                  : 'bg-white text-[#002147] border-gray-300 hover:bg-gray-50'
              }`}
            >
              PhD Positions
            </button>
            <button
              type="button"
              onClick={() => setView('articles')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                view === 'articles'
                  ? 'bg-[#002147] text-white border-[#002147]'
                  : 'bg-white text-[#002147] border-gray-300 hover:bg-gray-50'
              }`}
            >
              PhD Articles & Tips
            </button>
          </div>
        )}

        {!loading && !error && (!jobs || jobs.length === 0) && (
          <p className="text-gray-600 text-sm">
            No PhD content has been synced yet. The engine will populate this list
            automatically after the next sync.
          </p>
        )}

        {!loading && !error && jobs && jobs.length > 0 && (
          (() => {
            const positions = jobs.filter(isPositionLike);
            const articles = jobs.filter((job) => !isPositionLike(job));
            let active = view === 'positions' ? positions : articles;

            const normalizedQuery = query.trim().toLowerCase();
            if (normalizedQuery) {
              active = active.filter((job) => {
                const text = `${job.title ?? ''} ${job.company ?? ''} ${job.city ?? ''} ${
                  job.country ?? ''
                } ${job.description ?? ''}`
                  .toString()
                  .toLowerCase();
                return text.includes(normalizedQuery);
              });
            }

            if (activeKeyword) {
              const kw = activeKeyword.toLowerCase();
              active = active.filter((job) => {
                const text = `${job.title ?? ''} ${job.description ?? ''}`
                  .toString()
                  .toLowerCase();

                if (kw.includes('ai')) {
                  return /ai|artificial intelligence|machine learning|data science/.test(text);
                }
                if (kw.includes('climate')) {
                  return /climate|sustainability|environment|energy/.test(text);
                }
                if (kw.includes('europe')) {
                  return /europe|european|germany|italy|france|spain|netherlands|sweden|norway|denmark/.test(
                    text,
                  );
                }
                if (kw.includes('remote')) {
                  return /remote/.test(text);
                }

                return true;
              });
            }

            const totalItems = active.length;
            const totalPages = Math.ceil(totalItems / pageSize) || 1;
            const currentPage = Math.min(Math.max(page, 1), totalPages);
            const start = (currentPage - 1) * pageSize;
            const end = start + pageSize;
            const visible = active.slice(start, end);
            const totalStored = jobs.length;

            if (totalItems === 0) {
              return (
                <p className="text-gray-600 text-sm mt-2">
                  {view === 'positions'
                    ? 'No clear PhD positions detected yet. Try again after the next sync or explore the articles tab.'
                    : 'No PhD articles have been synced yet. Try again after the next sync.'}
                </p>
              );
            }

            return (
              <>
                <div className="flex items-center justify-between mb-3 text-xs text-gray-600">
                  <span>
                    Showing
                    {totalItems === 0
                      ? ' 0'
                      : ` ${start + 1}-${Math.min(end, totalItems)}`}{' '}
                    of {totalItems} PhD items (out of {totalStored} stored)
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
                          <span className="font-medium">Type:</span> PhD / Doctoral position
                        </p>
                        {job.deadline && (
                          <p>
                            <span className="font-medium">Deadline:</span>{' '}
                            {new Date(job.deadline).toLocaleDateString()}
                          </p>
                        )}
                        <p>
                          <span className="font-medium">Posted:</span>{' '}
                          {new Date(job.postedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-between items-center">
                      <a
                        href={job.applicationLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-md bg-[#FF9900] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#e68a00] transition-colors"
                      >
                        {view === 'positions' ? 'Apply on website' : 'Read article'}
                      </a>
                    </div>
                  </article>
                  ))}
                </div>

                <div className="flex items-center justify-between mt-4 text-xs text-gray-600">
                  <span>
                    Showing
                    {totalItems === 0
                      ? ' 0'
                      : ` ${start + 1}-${Math.min(end, totalItems)}`}{' '}
                    of {totalItems} PhD items
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
              </>
            );
          })()
        )}
      </main>
    </div>
  );
}
