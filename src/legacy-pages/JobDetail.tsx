import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapPin, Clock, ExternalLink } from 'lucide-react';
import Navbar from '../components/Navbar';
import { supabase } from '../lib/supabase';
import type { JobOpportunity } from '../lib/database.types';

interface SummaryState {
  loading: boolean;
  error: string | null;
  text: string | null;
}

export default function JobDetail() {
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

    const jobId = id;

    async function loadJob() {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('JobOpportunity')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) {
        console.error('Failed to load job opportunity', error);
        setError('Could not load this job opportunity. Please try again later.');
      } else {
        setJob(data as JobOpportunity);
      }

      setLoading(false);
    }

    void loadJob();
  }, [id]);

  useEffect(() => {
    if (!job) return;

    const jobId = job.id;

    async function loadSummary() {
      setSummary({ loading: true, error: null, text: null });
      try {
        const res = await fetch(`/api/summarize-job?id=${encodeURIComponent(jobId)}&type=JOB`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const body = (await res.json()) as { summary?: string };
        setSummary({ loading: false, error: null, text: body.summary ?? null });
      } catch (e) {
        console.error('Failed to load AI summary for job', e);
        setSummary({ loading: false, error: 'AI summary is currently unavailable.', text: null });
      }
    }

    void loadSummary();
  }, [job]);

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 text-xs text-[#002147] hover:underline"
        >
          ← Back to PhD Positions
        </button>

        {loading && <p className="text-gray-600 text-sm">Loading opportunity…</p>}
        {error && !loading && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {!loading && !error && job && (
          <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-6">
            {/* Main column */}
            <article className="bg-white rounded-lg shadow-md overflow-hidden">
              {/* Hero header */}
              <div className="bg-[#002147] text-white px-6 py-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="inline-block px-3 py-1 text-xs font-semibold bg-[#FF9900] text-white rounded-full">
                    PhD
                  </span>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold mb-2 leading-snug">{job.title}</h1>
                {job.company && (
                  <p className="text-sm opacity-90 mb-1">{job.company}</p>
                )}
                <div className="flex flex-wrap items-center gap-4 text-xs opacity-90 mt-2">
                  {(job.city || job.country) && (
                    <span className="flex items-center">
                      <MapPin className="h-4 w-4 mr-1" />
                      {[job.city, job.country].filter(Boolean).join(', ')}
                    </span>
                  )}
                  {job.deadline && (
                    <span className="flex items-center">
                      <Clock className="h-4 w-4 mr-1" />
                      Deadline {new Date(job.deadline).toLocaleDateString()}
                    </span>
                  )}
                  <span className="flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    Posted {new Date(job.postedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Overview + description */}
              <div className="px-6 py-5 space-y-6">
                <section>
                  <h2 className="text-sm font-semibold text-[#002147] mb-2">Overview</h2>
                  {summary.loading && (
                    <p className="text-xs text-gray-600">
                      Generating a brief overview with AI…
                    </p>
                  )}
                  {!summary.loading && summary.error && (
                    <p className="text-xs text-gray-600">{summary.error}</p>
                  )}
                  {!summary.loading && summary.text && (
                    <p className="text-xs text-gray-700 whitespace-pre-line">{summary.text}</p>
                  )}
                  {!summary.loading && !summary.text && !summary.error && (
                    <p className="text-xs text-gray-700 whitespace-pre-line">
                      {job.description}
                    </p>
                  )}
                </section>

                {job.requirements && job.requirements.length > 0 && (
                  <section>
                    <h2 className="text-sm font-semibold text-[#002147] mb-2">
                      Key requirements
                    </h2>
                    <ul className="list-disc list-inside text-xs text-gray-700 space-y-1">
                      {job.requirements.map((req, idx) => (
                        <li key={idx}>{req}</li>
                      ))}
                    </ul>
                  </section>
                )}

                <section>
                  <h2 className="text-sm font-semibold text-[#002147] mb-2">Full description</h2>
                  <p className="text-xs text-gray-700 whitespace-pre-line">{job.description}</p>
                </section>

                <p className="text-[11px] text-gray-500">Source: {job.source}</p>
              </div>
            </article>

            {/* Sidebar */}
            <aside className="space-y-4">
              <div className="bg-white rounded-lg shadow-md p-5 flex flex-col gap-3">
                <div className="text-2xl font-bold text-[#002147]">
                  PhD opportunity
                </div>
                <p className="text-xs text-gray-600">
                  Applications are submitted on the original university or lab website.
                </p>
                <a
                  href={job.applicationLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-lg bg-[#FF9900] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e68a00] transition-colors w-full"
                >
                  Apply Now
                </a>
                <a
                  href={job.applicationLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-xs font-medium text-[#002147] hover:bg-gray-50 transition-colors w-full"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Open Original Page
                </a>
              </div>

              <div className="bg-white rounded-lg shadow-md p-5 text-xs text-gray-700 space-y-2">
                <h3 className="text-sm font-semibold text-[#002147] mb-1">Opportunity details</h3>
                <p>
                  <span className="font-medium">Level:</span> PhD
                </p>
                {(job.city || job.country) && (
                  <p>
                    <span className="font-medium">Location:</span>{' '}
                    {[job.city, job.country].filter(Boolean).join(', ')}
                  </p>
                )}
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
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
