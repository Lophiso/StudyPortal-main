'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import NavbarNext from '../../components/NavbarNext';
import type { CanadaOpportunityPublic } from '../../lib/canada/types';
import {
  CANADA_FUNDING_LABEL,
  CANADA_FUNDING_TYPES,
  CANADA_PROGRAM_TYPES,
  CANADA_TAB_LABEL,
  CANADA_TRI_STATE_LABEL,
  CANADA_TRI_STATES,
  type CanadaFundingType,
  type CanadaProgramType,
  type CanadaTriState,
} from '../../lib/canada/constants';

function formatVerifiedAgo(iso: string) {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const hours = Math.max(0, Math.floor(diffMs / 36e5));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/70 shadow-sm overflow-hidden">
      <div className="p-5 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-2/3" />
        <div className="h-3 bg-slate-200 rounded w-1/2 mt-3" />
        <div className="h-3 bg-slate-200 rounded w-5/6 mt-4" />
        <div className="mt-4 flex gap-2">
          <div className="h-6 w-20 bg-slate-200 rounded-full" />
          <div className="h-6 w-16 bg-slate-200 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function parseProgramType(v: string | null): CanadaProgramType {
  if (v && (CANADA_PROGRAM_TYPES as readonly string[]).includes(v)) return v as CanadaProgramType;
  return 'PHD';
}

function CanadaPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<CanadaOpportunityPublic[]>([]);
  const [latest, setLatest] = useState<CanadaOpportunityPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tab = useMemo(() => parseProgramType(searchParams.get('tab')), [searchParams]);

  const [funding, setFunding] = useState<CanadaFundingType | ''>('');
  const [province, setProvince] = useState('');
  const [internationalAllowed, setInternationalAllowed] = useState<CanadaTriState | ''>('');
  const [startTerm, setStartTerm] = useState('');
  const [institution, setInstitution] = useState('');
  const [deadlineWithin, setDeadlineWithin] = useState<number | ''>('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const base = new URL('/api/canada', window.location.origin);
        base.searchParams.set('program_type', tab);
        base.searchParams.set('limit', '24');
        if (funding) base.searchParams.set('funding_type', funding);
        if (province.trim()) base.searchParams.set('province', province.trim());
        if (internationalAllowed) base.searchParams.set('international_allowed', internationalAllowed);
        if (startTerm.trim()) base.searchParams.set('start_term', startTerm.trim());
        if (institution.trim()) base.searchParams.set('institution', institution.trim());
        if (deadlineWithin !== '') base.searchParams.set('deadline_within_days', String(deadlineWithin));

        const res = await fetch(base.toString());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { data?: CanadaOpportunityPublic[]; error?: string };
        if (body.error) throw new Error(body.error);
        setItems(body.data ?? []);

        const latestUrl = new URL('/api/canada', window.location.origin);
        latestUrl.searchParams.set('program_type', tab);
        latestUrl.searchParams.set('limit', '6');
        const latestRes = await fetch(latestUrl.toString());
        if (latestRes.ok) {
          const latestBody = (await latestRes.json()) as { data?: CanadaOpportunityPublic[] };
          setLatest(latestBody.data ?? []);
        } else {
          setLatest([]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load Canada opportunities');
        setItems([]);
        setLatest([]);
      }

      setLoading(false);
    };

    void load();
  }, [tab, funding, province, internationalAllowed, startTerm, institution, deadlineWithin]);

  const setTab = (next: CanadaProgramType) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.push(`/canada?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#070B12]">
      <NavbarNext />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h1 className="text-[clamp(1.6rem,2.7vw,2.25rem)] font-extrabold text-[#002147] dark:text-white">
              Canada
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
              Verified Canadian opportunities with eligibility clarity, funding signals, and freshness timestamps.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(CANADA_PROGRAM_TYPES as readonly CanadaProgramType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9900]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
                  tab === t
                    ? 'bg-[#002147] text-white border-[#002147]'
                    : 'bg-white/70 dark:bg-white/10 text-[#002147] dark:text-white border-white/20 hover:bg-white/80 dark:hover:bg-white/15'
                }`}
              >
                {CANADA_TAB_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/20 bg-white/70 dark:bg-white/10 backdrop-blur-xl shadow-sm p-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-3">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Institution</label>
              <input
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="e.g. Toronto"
                className="mt-1 w-full rounded-xl border border-white/20 bg-white/60 dark:bg-white/10 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Funding</label>
              <select
                value={funding}
                onChange={(e) => setFunding(e.target.value as CanadaFundingType | '')}
                className="mt-1 w-full rounded-xl border border-white/20 bg-white/60 dark:bg-white/10 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none"
              >
                <option value="">All</option>
                {(CANADA_FUNDING_TYPES as readonly CanadaFundingType[]).map((f) => (
                  <option key={f} value={f}>
                    {CANADA_FUNDING_LABEL[f]}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Province</label>
              <input
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                placeholder="e.g. Ontario"
                className="mt-1 w-full rounded-xl border border-white/20 bg-white/60 dark:bg-white/10 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">International</label>
              <select
                value={internationalAllowed}
                onChange={(e) => setInternationalAllowed(e.target.value as CanadaTriState | '')}
                className="mt-1 w-full rounded-xl border border-white/20 bg-white/60 dark:bg-white/10 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none"
              >
                <option value="">All</option>
                {(CANADA_TRI_STATES as readonly CanadaTriState[]).map((v) => (
                  <option key={v} value={v}>
                    {CANADA_TRI_STATE_LABEL[v]}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Deadline window</label>
              <select
                value={deadlineWithin}
                onChange={(e) => {
                  const v = e.target.value;
                  setDeadlineWithin(v ? Number(v) : '');
                }}
                className="mt-1 w-full rounded-xl border border-white/20 bg-white/60 dark:bg-white/10 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none"
              >
                <option value="">Any</option>
                <option value="7">Next 7 days</option>
                <option value="14">Next 14 days</option>
                <option value="30">Next 30 days</option>
                <option value="90">Next 90 days</option>
              </select>
            </div>

            <div className="md:col-span-1">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Start term</label>
              <input
                value={startTerm}
                onChange={(e) => setStartTerm(e.target.value)}
                placeholder="Fall 2026"
                className="mt-1 w-full rounded-xl border border-white/20 bg-white/60 dark:bg-white/10 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none"
              />
            </div>
          </div>
        </div>

        {latest.length > 0 && (
          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#002147] dark:text-white">Latest verified</h2>
              <div className="text-xs text-slate-600 dark:text-slate-300">Sorted by verification time</div>
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {latest.map((row) => (
                <Link
                  key={row.id}
                  href={`/canada/${row.id}`}
                  className="rounded-2xl border border-white/20 bg-white/70 dark:bg-white/10 backdrop-blur-xl shadow-sm p-4 hover:shadow-md transition-shadow"
                >
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Verified {formatVerifiedAgo(row.last_verified_at)} · {row.deadline_confidence}
                  </div>
                  <div className="mt-2 font-extrabold text-[#002147] dark:text-white">{row.title_clean}</div>
                  <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">{row.institution_name}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <SkeletonCard key={idx} />
              ))}
            </div>
          )}

          {!loading && error && <div className="text-sm text-red-600">{error}</div>}

          {!loading && !error && items.length === 0 && (
            <div className="rounded-2xl border border-white/20 bg-white/70 dark:bg-white/10 backdrop-blur-xl shadow-sm p-6 text-sm text-slate-700 dark:text-slate-200">
              No Canada opportunities match your filters yet.
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <div className="flex flex-col gap-4">
              {items.map((row) => (
                <div
                  key={row.id}
                  className="rounded-2xl border border-white/20 bg-white/70 dark:bg-white/10 backdrop-blur-xl shadow-sm overflow-hidden"
                >
                  <div className="p-5 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                      <h3 className="text-lg md:text-xl font-semibold text-[#002147] dark:text-white leading-snug">
                        <Link href={`/canada/${row.id}`} className="hover:underline">
                          {row.title_clean}
                        </Link>
                      </h3>
                      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                        {[row.institution_name, row.department].filter(Boolean).join(' · ')}
                      </p>
                      <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                        {row.nutshell_15_words}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full bg-white/60 dark:bg-white/10 border border-white/20 text-xs font-semibold text-[#002147] dark:text-white">
                        Verified {formatVerifiedAgo(row.last_verified_at)}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-white/60 dark:bg-white/10 border border-white/20 text-xs font-semibold text-[#002147] dark:text-white">
                        {CANADA_FUNDING_LABEL[row.funding_type]}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-white/60 dark:bg-white/10 border border-white/20 text-xs font-semibold text-[#002147] dark:text-white">
                        Deadline {row.deadline_date ?? 'TBD'} · {row.deadline_confidence}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-white/60 dark:bg-white/10 border border-white/20 text-xs font-semibold text-[#002147] dark:text-white">
                        Intl {CANADA_TRI_STATE_LABEL[row.international_allowed]} · {row.eligibility_confidence}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default function CanadaLandingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F7FA] dark:bg-[#070B12]" />}>
      <CanadaPageInner />
    </Suspense>
  );
}
