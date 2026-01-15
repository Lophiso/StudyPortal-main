'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import NavbarNext from '../../../components/NavbarNext';
import type { CanadaOpportunityPublic } from '../../../lib/canada/types';
import { CANADA_FUNDING_LABEL, CANADA_TAB_LABEL, CANADA_TRI_STATE_LABEL } from '../../../lib/canada/constants';

function formatVerifiedAgo(iso: string) {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const hours = Math.max(0, Math.floor(diffMs / 36e5));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function DetailInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<CanadaOpportunityPublic | null>(null);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/canada?id=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { data?: CanadaOpportunityPublic; error?: string };
        if (body.error) throw new Error(body.error);
        if (!body.data) throw new Error('Not found');
        setItem(body.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
      setLoading(false);
    };

    void load();
  }, [id]);

  const meta = useMemo(() => {
    if (!item) return null;
    return {
      title: item.title_clean,
      org: [item.institution_name, item.department, item.lab_group].filter(Boolean).join(' · '),
    };
  }, [item]);

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#070B12]">
      <NavbarNext />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 text-xs text-[#002147] dark:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9900]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded"
        >
          ← Back
        </button>

        {loading && (
          <div className="rounded-2xl border border-white/20 bg-white/70 dark:bg-white/10 backdrop-blur-xl shadow-sm p-6 animate-pulse">
            <div className="h-5 bg-slate-200 rounded w-2/3" />
            <div className="h-3 bg-slate-200 rounded w-1/2 mt-3" />
            <div className="h-24 bg-slate-200 rounded w-full mt-6" />
          </div>
        )}

        {!loading && error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && item && meta && (
          <article className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-8">
              <div className="rounded-2xl border border-white/20 bg-white/70 dark:bg-white/10 backdrop-blur-xl shadow-sm p-6">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="px-2.5 py-1 rounded-full bg-white/60 dark:bg-white/10 border border-white/20 font-semibold text-[#002147] dark:text-white">
                    {CANADA_TAB_LABEL[item.program_type]}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-white/60 dark:bg-white/10 border border-white/20 font-semibold text-[#002147] dark:text-white">
                    Verified {formatVerifiedAgo(item.last_verified_at)}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-white/60 dark:bg-white/10 border border-white/20 font-semibold text-[#002147] dark:text-white">
                    Freshness {item.freshness_score}/100
                  </span>
                </div>

                <h1 className="mt-4 text-[clamp(1.6rem,2.8vw,2.4rem)] font-extrabold text-[#002147] dark:text-white leading-[1.08]">
                  {meta.title}
                </h1>
                {meta.org ? (
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{meta.org}</p>
                ) : null}

                <p className="mt-5 text-sm text-slate-800 dark:text-slate-100">{item.nutshell_15_words}</p>

                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <a
                    href={item.application_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/20 hover:bg-white/30 text-[#001a35] dark:text-white font-extrabold py-3 px-5 transition-colors shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9900]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    style={{
                      backgroundImage:
                        'linear-gradient(135deg, rgba(255,255,255,0.32), rgba(255,255,255,0.12)), radial-gradient(650px circle at 50% 0%, rgba(255,153,0,0.25), rgba(255,153,0,0) 55%)',
                    }}
                  >
                    Apply / View
                  </a>
                  <a
                    href={item.canonical_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/70 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/15 text-[#002147] dark:text-white font-semibold py-3 px-5 transition-colors"
                  >
                    Source
                  </a>
                </div>
              </div>
            </section>

            <aside className="lg:col-span-4">
              <div className="sticky top-24 rounded-2xl border border-white/20 bg-white/70 dark:bg-white/10 backdrop-blur-xl shadow-sm p-5">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Key details</div>

                <div className="mt-4 space-y-3 text-sm text-slate-800 dark:text-slate-100">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Location</div>
                    <div className="font-semibold">{[item.city, item.province, 'Canada'].filter(Boolean).join(', ')}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Deadline</div>
                      <div className="font-semibold">{item.deadline_date ?? 'TBD'}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Confidence: {item.deadline_confidence}</div>
                      {item.deadline_evidence ? (
                        <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">“{item.deadline_evidence}”</div>
                      ) : null}
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Start term</div>
                      <div className="font-semibold">{item.start_term ?? 'TBA'}</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Funding</div>
                    <div className="font-semibold">{CANADA_FUNDING_LABEL[item.funding_type]}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Confidence: {item.funding_confidence}</div>
                    {item.funding_evidence ? (
                      <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">“{item.funding_evidence}”</div>
                    ) : null}
                  </div>

                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">International applicants</div>
                    <div className="font-semibold">{CANADA_TRI_STATE_LABEL[item.international_allowed]}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Confidence: {item.eligibility_confidence}</div>
                    {item.eligibility_evidence ? (
                      <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">“{item.eligibility_evidence}”</div>
                    ) : null}
                    {item.eligibility_notes ? (
                      <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{item.eligibility_notes}</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </aside>
          </article>
        )}
      </main>
    </div>
  );
}

export default function CanadaDetailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F7FA] dark:bg-[#070B12]" />}>
      <DetailInner />
    </Suspense>
  );
}
