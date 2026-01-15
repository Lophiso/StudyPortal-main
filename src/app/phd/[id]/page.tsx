'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import NavbarNext from '../../../components/NavbarNext';
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

function faviconUrl(targetUrl: string) {
  try {
    const host = new URL(targetUrl).hostname.replace(/^www\./, '');
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  } catch {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(targetUrl)}&sz=128`;
  }
}

function recordHomeContext(kind: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('sp_home_context', JSON.stringify({ kind, ts: Date.now() }));
  } catch {
    return;
  }
}

type GraphNode = { id: string; group: string; x?: number; y?: number };
type GraphLink = { source: string; target: string; value: number };

function extractKeywords(job: JobOpportunity) {
  const text = `${job.title ?? ''} ${job.company ?? ''} ${job.department ?? ''} ${job.card_summary ?? ''} ${job.description ?? ''}`
    .toString()
    .toLowerCase();

  const stop = new Set(
    [
      'phd',
      'doctoral',
      'position',
      'student',
      'students',
      'research',
      'university',
      'project',
      'applications',
      'apply',
      'will',
      'with',
      'and',
      'or',
      'the',
      'a',
      'an',
      'to',
      'of',
      'in',
      'for',
      'on',
    ].map((s) => s.toLowerCase()),
  );

  const counts = new Map<string, number>();
  const words = text
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => w.length >= 3 && w.length <= 18)
    .filter((w) => !stop.has(w));

  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([w]) => w);
}

function buildForceGraph(keywords: string[]) {
  const root = 'This PhD';
  const nodes: GraphNode[] = [{ id: root, group: 'root' }];
  const links: GraphLink[] = [];

  keywords.forEach((k, idx) => {
    const label = k.charAt(0).toUpperCase() + k.slice(1);
    nodes.push({ id: label, group: 'keyword' });
    links.push({ source: root, target: label, value: Math.max(1, 8 - Math.floor(idx / 2)) });
  });

  const sim = forceSimulation(nodes as any)
    .force('charge', forceManyBody().strength(-110))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide(22))
    .force('link', forceLink(links as any).id((d: any) => d.id).distance(70).strength(0.7));

  sim.tick(140);
  sim.stop();

  return { nodes, links };
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
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; links: GraphLink[] } | null>(null);

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

      try {
        const res = await fetch(`/api/phd?id=${encodeURIComponent(jobId)}`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const body = (await res.json()) as { data?: JobOpportunity; error?: string };
        if (body.error) {
          throw new Error(body.error);
        }
        if (!body.data) {
          throw new Error('Not found');
        }
        setJob(body.data);
      } catch (e) {
        console.error('Failed to load PhD opportunity', e);
        setError('Could not load this PhD opportunity. Please try again later.');
      }

      setLoading(false);
    }

    void loadJob();
  }, [params]);

  useEffect(() => {
    recordHomeContext('phd');
  }, []);

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

  useEffect(() => {
    if (!job) return;
    const keywords = extractKeywords(job);
    setGraph(buildForceGraph(keywords));
  }, [job]);

  return (
    <div className="min-h-screen bg-[#F5F7FB] dark:bg-[#070B12]">
      <NavbarNext />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 text-xs text-[#002147] dark:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9900]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded"
        >
          ← Back to PhD Positions
        </button>

        {loading && (
          <div className="rounded-2xl border border-white/10 bg-white/70 shadow-sm p-6 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-1/3" />
            <div className="h-8 bg-slate-200 rounded w-2/3 mt-4" />
            <div className="h-4 bg-slate-200 rounded w-1/2 mt-4" />
            <div className="h-28 bg-slate-200 rounded w-full mt-6" />
          </div>
        )}
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {!loading && !error && job && (
          <article>
            <header className="mb-6">
              <div className="flex items-start gap-3">
                <img src={faviconUrl(job.applicationLink)} alt="" className="h-11 w-11 rounded-2xl bg-white/70 border border-white/20" />
                <div>
                  <h1 className="text-[clamp(1.6rem,2.8vw,2.6rem)] font-extrabold text-[#002147] dark:text-white leading-[1.08]">
                    {!isTba(job.title) && !isRubbishTitle(job.title)
                      ? job.title
                      : !isTba(job.full_title) && !isRubbishTitle(job.full_title)
                        ? job.full_title
                        : 'PhD Opportunity'}
                  </h1>

                  {(() => {
                    const institution = !isTba(job.company) ? job.company : getSourceDomain(job.applicationLink);
                    const dept = !isTba(job.department) ? job.department : null;
                    const parts = [institution, dept].filter(Boolean);
                    return parts.length > 0 ? (
                      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{parts.join(' · ')}</p>
                    ) : null;
                  })()}
                </div>
              </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <aside className="lg:col-span-4">
                <div className="sticky top-24 rounded-2xl border border-white/20 bg-white/70 dark:bg-white/10 backdrop-blur-xl shadow-sm p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Application</div>
                    <a
                      href={job.applicationLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-xs font-semibold text-[#002147] dark:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9900]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded"
                    >
                      Source <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-slate-800 dark:text-slate-100">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Location</div>
                      {(() => {
                        const parts = [job.city, job.country].filter((v) => !isTba(v));
                        return <div className="font-semibold">{parts.length > 0 ? parts.join(', ') : 'Remote / Unspecified'}</div>;
                      })()}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Deadline</div>
                        <div className="font-semibold">
                          {job.deadline && !isTba(job.deadline) ? new Date(job.deadline).toLocaleDateString() : 'TBD'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Funding</div>
                        <div className="font-semibold">{!isTba(job.funding_status) ? job.funding_status : 'TBA'}</div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Supervisor</div>
                      <div className="font-semibold">Contact Admissions for Supervisor Details</div>
                    </div>

                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Posted</div>
                      <div className="font-semibold">{new Date(job.postedAt).toLocaleDateString()}</div>
                    </div>
                  </div>

                  <a
                    href={job.applicationLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 block w-full text-center rounded-2xl border border-white/20 bg-white/20 hover:bg-white/30 text-[#001a35] dark:text-white font-extrabold py-3 transition-colors shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9900]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    style={{
                      backgroundImage:
                        'linear-gradient(135deg, rgba(255,255,255,0.32), rgba(255,255,255,0.12)), radial-gradient(650px circle at 50% 0%, rgba(255,153,0,0.25), rgba(255,153,0,0) 55%)',
                    }}
                  >
                    Apply Now
                  </a>

                  <div className="mt-4 text-[11px] text-slate-500 dark:text-slate-400">Source: {job.source}</div>
                </div>
              </aside>

              <section className="lg:col-span-8">
                <div className="rounded-2xl border border-white/20 bg-white/70 dark:bg-white/10 backdrop-blur-xl shadow-sm p-5">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">AI Summary</div>
                  <div className="mt-3">
                    {summary.loading && <p className="text-sm text-slate-600 dark:text-slate-300">Generating summary…</p>}
                    {!summary.loading && summary.error && <p className="text-sm text-slate-600 dark:text-slate-300">{summary.error}</p>}
                    {!summary.loading && summary.text && (
                      <div className="prose prose-slate dark:prose-invert max-w-none text-sm">
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
                      <div className="prose prose-slate dark:prose-invert max-w-none text-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{job.description}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-white/20 bg-white/70 dark:bg-white/10 backdrop-blur-xl shadow-sm p-5">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Full description</div>
                  <div className="mt-3 prose prose-slate dark:prose-invert max-w-none text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{job.description}</ReactMarkdown>
                  </div>
                </div>

                {job.requirements && job.requirements.length > 0 && (
                  <div className="mt-6 rounded-2xl border border-white/20 bg-white/70 dark:bg-white/10 backdrop-blur-xl shadow-sm p-5">
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Key requirements</div>
                    <div className="mt-3 prose prose-slate dark:prose-invert max-w-none text-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {job.requirements.map((r) => `- ${r}`).join('\n')}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {graph && (
                  <div className="mt-6 rounded-2xl border border-white/20 bg-white/70 dark:bg-white/10 backdrop-blur-xl shadow-sm p-5">
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Research graph</div>
                    <div className="mt-4 w-full overflow-hidden">
                      <svg viewBox="-260 -170 520 340" className="w-full h-[320px]">
                        <g>
                          {graph.links.map((l, idx) => {
                            const s = graph.nodes.find((n) => n.id === l.source);
                            const t = graph.nodes.find((n) => n.id === l.target);
                            if (!s || !t) return null;
                            return (
                              <line
                                key={idx}
                                x1={s.x ?? 0}
                                y1={s.y ?? 0}
                                x2={t.x ?? 0}
                                y2={t.y ?? 0}
                                stroke="rgba(100,116,139,0.35)"
                                strokeWidth={Math.max(1, Math.min(3, l.value / 2))}
                              />
                            );
                          })}
                        </g>
                        <g>
                          {graph.nodes.map((n) => {
                            const isRoot = n.group === 'root';
                            return (
                              <g key={n.id} transform={`translate(${n.x ?? 0},${n.y ?? 0})`}>
                                <circle
                                  r={isRoot ? 26 : 18}
                                  fill={isRoot ? 'rgba(255,153,0,0.55)' : 'rgba(255,255,255,0.35)'}
                                  stroke="rgba(255,255,255,0.35)"
                                />
                                <text
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  fill={isRoot ? '#0B1220' : '#0B1220'}
                                  fontSize={isRoot ? 12 : 10}
                                  fontWeight={isRoot ? 700 : 600}
                                >
                                  {n.id.length > 16 ? `${n.id.slice(0, 16)}…` : n.id}
                                </text>
                              </g>
                            );
                          })}
                        </g>
                      </svg>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
