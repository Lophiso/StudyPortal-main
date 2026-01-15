'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import type { JobOpportunity } from '../../../lib/database.types';
import NavbarNext from '../../../components/NavbarNext';
import { SEARCH_CONFIG } from '../../../../lib/searchConfig';

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/70 shadow-sm overflow-hidden">
      <div className="p-6 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-2/3" />
        <div className="h-3 bg-slate-200 rounded w-1/2 mt-3" />
        <div className="h-3 bg-slate-200 rounded w-5/6 mt-4" />
      </div>
    </div>
  );
}

function recordHomeContext(kind: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('sp_home_context', JSON.stringify({ kind, ts: Date.now() }));
  } catch {
    return;
  }
}

export default function CanadaPhdPage() {
  const keywords = useMemo(() => SEARCH_CONFIG.canadaPhdKeywords, []);
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
        .eq('type', 'PHD')
        .order('postedAt', { ascending: false })
        .limit(50);

      if (supabaseError) {
        setError('Failed to load Canada PhD opportunities.');
        setLoading(false);
        return;
      }

      setJobs((data ?? []) as JobOpportunity[]);
      setLoading(false);
    };

    void load();
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#070B12]">
      <NavbarNext />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-[#002147] dark:text-white">Canada PhD Opportunities</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">
          Keywords driving automated discovery:
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {keywords.map((k) => (
            <span key={k} className="px-3 py-1 bg-white/70 dark:bg-white/10 border border-white/20 rounded-full text-xs text-slate-800 dark:text-slate-100">
              {k}
            </span>
          ))}
        </div>

        <div className="mt-8">
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Array.from({ length: 6 }).map((_, idx) => (
                <SkeletonCard key={idx} />
              ))}
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!loading && !error && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/phd/${job.id}`}
                  onClick={() => recordHomeContext('canada_phd')}
                  className="block rounded-2xl border border-white/20 bg-white/70 dark:bg-white/10 backdrop-blur-xl shadow-sm p-6 hover:shadow-md transition-shadow"
                >
                  <h2 className="text-lg font-semibold text-[#002147] dark:text-white">{job.title}</h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">{job.company}</p>
                  <p className="mt-2 text-xs text-gray-600 dark:text-slate-300">
                    {job.city}, {job.country} · Posted {new Date(job.postedAt).toLocaleDateString()}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
