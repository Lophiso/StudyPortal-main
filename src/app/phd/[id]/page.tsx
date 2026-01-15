'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import NavbarNext from '../../../components/NavbarNext';
import { supabase } from '../../../lib/supabase';
import type { JobOpportunity } from '../../../lib/database.types';

function getSourceDomain(source?: string | null) {
  if (!source) return null;
  try {
    return new URL(source).hostname.replace(/^www\./, '');
  } catch {
    return source;
  }
}

function isTba(value?: string | null) {
  const v = (value ?? '').toString().trim();
  return !v || v.toLowerCase() === 'tba' || v.toLowerCase() === 'unknown';
}

function isRubbishTitle(title?: string | null) {
  const t = (title ?? '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return true;
  return (
    t.startsWith('find your ideal') ||
    t.startsWith('find your next') ||
    t.startsWith('sign up for instagram') ||
    t.startsWith('log in') ||
    (t.includes('sign up') && t.includes('instagram')) ||
    t.includes('join instagram') ||
    t.includes('facebook.com') ||
    t.includes('instagram.com') ||
    t.includes('twitter.com') ||
    t.includes('x.com')
  );
}

function stripRedundantTitleFromSummary(summaryText: string, jobTitle: string, fullTitle: string) {
  const lines = summaryText.split(/\r?\n/);
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();

  const first = (lines[0] ?? '').trim();
  const normalizedFirst = first
    .replace(/^#+\s*/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  const candidates = [jobTitle, fullTitle]
    .map((t) => (t ?? '').toString().trim())
    .filter(Boolean)
    .map((t) => t.replace(/\s+/g, ' ').toLowerCase());

  if (candidates.some((c) => normalizedFirst === c)) {
    lines.shift();
    while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  }

  return lines.join('\n').trim();
}

interface SummaryState {
  loading: boolean;
  error: string | null;
  text: string | null;
}

export default function PhdDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<JobOpportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryState>({ loading: false, error: null, text: null });

  useEffect(() => {
    const id = params?.id;

    if (!id) {
      setError('Missing job identifier.');
      setLoading(false);
      return;
    }

    const jobId = id;

    async function loadJob() {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.from('JobOpportunity').select('*').eq('id', jobId).single();

      if (error) {
        console.error('Failed to load PhD opportunity', error);
        setError('Could not load this PhD opportunity. Please try again later.');
      } else {
        setJob(data as JobOpportunity);
      }

      setLoading(false);
    }

    void loadJob();
  }, [params]);

  useEffect(() => {
    if (!job) return;

    const jobId = job.id;

    async function loadSummary() {
      setSummary({ loading: true, error: null, text: null });
      try {
        const res = await fetch(`/api/summarize-job?id=${encodeURIComponent(jobId)}&type=PHD`);
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
      <NavbarNext />
      <main className="max-w-4xl mx-auto px-4 py-10">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 text-xs text-[#002147] hover:underline"
        >
          ← Back to PhD Positions
        </button>

        {loading && <p className="text-gray-600 text-sm">Loading opportunity…</p>}
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {!loading && !error && job && (
          <article className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <header className="mb-4">
              <h1 className="text-2xl font-semibold text-[#002147] mb-1">
                {!isTba(job.title) && !isRubbishTitle(job.title)
                  ? job.title
                  : !isTba(job.full_title) && !isRubbishTitle(job.full_title)
                    ? job.full_title
                    : 'PhD Opportunity'}
              </h1>

              {(() => {
                const institution = !isTba(job.company) ? job.company : getSourceDomain(job.applicationLink);
                return institution ? <p className="text-sm text-gray-700 mb-1">{institution}</p> : null;
              })()}

              {(() => {
                const parts = [job.city, job.country].filter((v) => !isTba(v));
                return parts.length > 0 ? (
                  <p className="text-xs text-gray-500 mb-1">{parts.join(', ')}</p>
                ) : null;
              })()}
              <div className="text-xs text-gray-600 space-y-1 mt-2">
                <p>
                  <span className="font-medium">Type:</span> PhD / Doctoral position
                </p>
                {job.deadline && !isTba(job.deadline) && (
                  <p>
                    <span className="font-medium">Deadline:</span> {new Date(job.deadline).toLocaleDateString()}
                  </p>
                )}
                <p>
                  <span className="font-medium">Posted:</span> {new Date(job.postedAt).toLocaleDateString()}
                </p>
              </div>
            </header>

            <section className="mb-4">
              <h2 className="text-sm font-semibold text-[#002147] mb-1">Summary</h2>
              {summary.loading && <p className="text-xs text-gray-600">Generating summary…</p>}
              {!summary.loading && summary.error && <p className="text-xs text-gray-600">{summary.error}</p>}
              {!summary.loading && summary.text && (
                <div className="prose prose-slate max-w-none text-xs">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {stripRedundantTitleFromSummary(
                      summary.text,
                      (job.title ?? '').toString(),
                      (job.full_title ?? '').toString(),
                    )}
                  </ReactMarkdown>
                </div>
              )}
              {!summary.loading && !summary.text && !summary.error && (
                <div className="prose prose-slate max-w-none text-xs">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{job.description}</ReactMarkdown>
                </div>
              )}
            </section>

            <section className="mb-4">
              <h2 className="text-sm font-semibold text-[#002147] mb-1">Description</h2>
              <div className="prose prose-slate max-w-none text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{job.description}</ReactMarkdown>
              </div>
            </section>

            {job.requirements && job.requirements.length > 0 && (
              <section className="mb-4">
                <h2 className="text-sm font-semibold text-[#002147] mb-1">Key requirements</h2>
                <div className="prose prose-slate max-w-none text-xs">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{job.requirements.map((r) => `- ${r}`).join('\n')}</ReactMarkdown>
                </div>
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
