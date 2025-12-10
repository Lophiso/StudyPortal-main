import { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import { supabase } from '../lib/supabase';
import type { JobOpportunity } from '../lib/database.types';

type PhdView = 'positions' | 'articles';

function isPositionLike(job: JobOpportunity): boolean {
  const text = `${job.title} ${job.description ?? ''}`.toLowerCase();
  const positionKeywords = [
    'phd position',
    'ph.d. position',
    'phd vacancy',
    'vacancy',
    'studentship',
    'scholarship',
    'call for applications',
    'open position',
    'fully funded phd',
  ];

  return positionKeywords.some((kw) => text.includes(kw));
}

export default function PhdPositions() {
  const [jobs, setJobs] = useState<JobOpportunity[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<PhdView>('positions');

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

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[#002147] mb-2">PhD Positions</h1>
          <p className="text-gray-600 max-w-2xl text-sm">
            Curated doctoral and PhD opportunities from leading universities and research
            institutes. Each listing includes key details about location, deadline, and
            how to apply.
          </p>
        </header>

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
            const active = view === 'positions' ? positions : articles;

            if (active.length === 0) {
              return (
                <p className="text-gray-600 text-sm mt-2">
                  {view === 'positions'
                    ? 'No clear PhD positions detected yet. Try again after the next sync or explore the articles tab.'
                    : 'No PhD articles have been synced yet. Try again after the next sync.'}
                </p>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {active.map((job) => (
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
            );
          })()
        )}
      </main>
    </div>
  );
}
