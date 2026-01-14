'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { JobOpportunity } from '../../../lib/database.types';
import NavbarNext from '../../../components/NavbarNext';
import { SEARCH_CONFIG } from '../../../../lib/searchConfig';

export default function CanadaJobsPage() {
  const keywords = useMemo(() => SEARCH_CONFIG.canadaJobKeywords, []);
  const [jobs, setJobs] = useState<JobOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error: supabaseError } = await supabase
        .from('JobOpportunity')
        .select('*')
        .eq('country', 'Canada')
        .eq('type', 'JOB')
        .order('postedAt', { ascending: false })
        .limit(50);

      if (supabaseError) {
        setError('Failed to load Canada jobs.');
        setLoading(false);
        return;
      }

      setJobs((data ?? []) as JobOpportunity[]);
      setLoading(false);
    };

    void load();
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <NavbarNext />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-[#002147]">Canada Jobs</h1>
        <p className="mt-2 text-sm text-gray-600">
          Keywords driving automated discovery:
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {keywords.map((k) => (
            <span key={k} className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs">
              {k}
            </span>
          ))}
        </div>

        <div className="mt-8">
          {loading && <p className="text-sm text-gray-600">Loading…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!loading && !error && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {jobs.map((job) => (
                <a
                  key={job.id}
                  href={job.applicationLink}
                  target="_blank"
                  rel="noreferrer"
                  className="block bg-white rounded-lg shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow"
                >
                  <h2 className="text-lg font-semibold text-[#002147]">{job.title}</h2>
                  <p className="mt-1 text-sm text-gray-600">{job.company}</p>
                  <p className="mt-2 text-xs text-gray-600">
                    {job.city}, {job.country} · Posted {new Date(job.postedAt).toLocaleDateString()}
                  </p>
                </a>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
