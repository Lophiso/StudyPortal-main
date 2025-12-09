import { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import { supabase } from '../lib/supabase';
import type { JobOpportunity } from '../lib/database.types';

export default function Jobs() {
  const [jobs, setJobs] = useState<JobOpportunity[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadJobs() {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('JobOpportunity')
        .select('*')
        .order('createdAt', { ascending: false });

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

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[#002147] mb-2">Job & PhD Opportunities</h1>
          <p className="text-gray-600 max-w-2xl text-sm">
            These opportunities are scraped from public job sources and enriched with AI
            to highlight PhD roles, funding information, and useful tags.
          </p>
        </header>

        {loading && (
          <p className="text-gray-600 text-sm">Loading opportunities…</p>
        )}

        {error && (
          <p className="text-sm text-red-600 mb-4">{error}</p>
        )}

        {!loading && !error && (!jobs || jobs.length === 0) && (
          <p className="text-gray-600 text-sm">
            No opportunities have been synced yet. Trigger the sync endpoint to
            populate this list.
          </p>
        )}

        {!loading && !error && jobs && jobs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {jobs.map((job) => (
              <article
                key={job.id}
                className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col justify-between"
              >
                <div>
                  <h2 className="text-lg font-semibold text-[#002147] mb-1">
                    {job.title}
                  </h2>
                  <p className="text-sm text-gray-700 mb-1">{job.company}</p>
                  {job.location && (
                    <p className="text-xs text-gray-500 mb-1">{job.location}</p>
                  )}

                  <div className="text-xs text-gray-600 space-y-1 mt-2">
                    <p>
                      <span className="font-medium">Type:</span>{' '}
                      {job.isPhD ? 'PhD / Doctoral' : 'Job / Other'}
                    </p>
                    <p>
                      <span className="font-medium">Funding:</span> {job.fundingType}
                    </p>
                    {job.deadline && (
                      <p>
                        <span className="font-medium">Deadline:</span>{' '}
                        {new Date(job.deadline).toLocaleDateString()}
                      </p>
                    )}
                    {job.postedAt && (
                      <p>
                        <span className="font-medium">Posted:</span> {job.postedAt}
                      </p>
                    )}
                  </div>

                  {job.tags && job.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {job.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex justify-between items-center">
                  <a
                    href={job.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-md bg-[#FF9900] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#e68a00] transition-colors"
                  >
                    View Original Listing
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
