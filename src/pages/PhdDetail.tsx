import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { supabase } from '../lib/supabase';
import type { JobOpportunity } from '../lib/database.types';

interface SummaryState {
  loading: boolean;
  error: string | null;
  text: string | null;
}

export default function PhdDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobOpportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryState>({ loading: false, error: null, text: null });

  useEffect(() => {
    if (!id) {
      setError('Missing job identifier.');
      setLoading(false);
      return;
    }

    async function loadJob() {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('JobOpportunity')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Failed to load PhD opportunity', error);
        setError('Could not load this PhD opportunity. Please try again later.');
      } else {
        setJob(data as JobOpportunity);
      }

      setLoading(false);
    }

    void loadJob();
  }, [id]);

  useEffect(() => {
    if (!job) return;

    async function loadSummary() {
      setSummary({ loading: true, error: null, text: null });
      try {
        const res = await fetch(`/api/summarize-job?id=${encodeURIComponent(job.id)}&type=PHD`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const body = (await res.json()) as { summary?: string };
        setSummary({ loading: false, error: null, text: body.summary ?? null });
      } catch (e) {
        console.error('Failed to load AI summary for PhD', e);
        setSummary({ loading: false, error: 'AI summary is currently unavailable.', text: null });
      }
    }

    void loadSummary();
  }, [job]);

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-10">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 text-xs text-[#002147] hover:underline"
        >
          ← Back to PhD Positions
        </button>

        {loading && <p className="text-gray-600 text-sm">Loading opportunity…</p>}
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {!loading && !error && job && (
          <article className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <header className="mb-4">
              <h1 className="text-2xl font-semibold text-[#002147] mb-1">{job.title}</h1>
              <p className="text-sm text-gray-700 mb-1">{job.company}</p>
              <p className="text-xs text-gray-500 mb-1">
                {[job.city, job.country].filter(Boolean).join(', ')}
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
            </header>

            <section className="mb-4">
              <h2 className="text-sm font-semibold text-[#002147] mb-1">AI summary</h2>
              {summary.loading && (
                <p className="text-xs text-gray-600">Generating a brief overview with AI…</p>
              )}
              {!summary.loading && summary.error && (
                <p className="text-xs text-gray-600">{summary.error}</p>
              )}
              {!summary.loading && summary.text && (
                <p className="text-xs text-gray-700 whitespace-pre-line">{summary.text}</p>
              )}
            </section>

            <section className="mb-4">
              <h2 className="text-sm font-semibold text-[#002147] mb-1">Description</h2>
              <p className="text-xs text-gray-700 whitespace-pre-line">{job.description}</p>
            </section>

            {job.requirements && job.requirements.length > 0 && (
              <section className="mb-4">
                <h2 className="text-sm font-semibold text-[#002147] mb-1">Key requirements</h2>
                <ul className="list-disc list-inside text-xs text-gray-700 space-y-0.5">
                  {job.requirements.map((req, idx) => (
                    <li key={idx}>{req}</li>
                  ))}
                </ul>
              </section>
            )}

            <div className="mt-6 flex justify-between items-center">
              <span className="text-[11px] text-gray-500">Source: {job.source}</span>
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
        )}
      </main>
    </div>
  );
}
