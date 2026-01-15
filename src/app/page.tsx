'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import NavbarNext from '../components/NavbarNext';

type HomeContext =
  | { kind: 'canada_phd'; ts: number }
  | { kind: 'phd'; ts: number }
  | { kind: 'jobs'; ts: number }
  | { kind: 'search'; ts: number }
  | { kind: 'unknown'; ts: number };

function safeParseContext(raw: string | null): HomeContext | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<HomeContext>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.kind !== 'string') return null;
    if (typeof parsed.ts !== 'number') return null;
    return parsed as HomeContext;
  } catch {
    return null;
  }
}

function extractTrendingTerms(titles: string[], max: number) {
  const stop = new Set(
    [
      'phd',
      'position',
      'positions',
      'student',
      'students',
      'doctoral',
      'doctorate',
      'postdoc',
      'job',
      'opportunity',
      'opportunities',
      'the',
      'and',
      'or',
      'in',
      'at',
      'to',
      'of',
      'for',
      'on',
      'with',
      'a',
      'an',
      'your',
      'our',
      'research',
    ].map((s) => s.toLowerCase()),
  );

  const counts = new Map<string, number>();
  for (const title of titles) {
    const words = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean)
      .filter((w) => w.length >= 3 && w.length <= 18)
      .filter((w) => !stop.has(w));

    for (const w of words) {
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
}

export default function HomePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [homeContext, setHomeContext] = useState<HomeContext | null>(null);
  const [trendingTerms, setTrendingTerms] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ctx = safeParseContext(window.localStorage.getItem('sp_home_context'));
    setHomeContext(ctx);
  }, []);

  useEffect(() => {
    const fetchTrending = async () => {
      const { data, error: supabaseError } = await supabase
        .from('JobOpportunity')
        .select('title')
        .order('postedAt', { ascending: false })
        .limit(200);

      if (supabaseError) {
        console.warn('Failed to load trending PhD terms', supabaseError);
        return;
      }

      const titles = (data ?? []).map((r: any) => (r?.title ?? '').toString()).filter(Boolean);
      setTrendingTerms(extractTrendingTerms(titles, 8));
    };

    void fetchTrending();
  }, []);

  const greetingTitle = (() => {
    if (homeContext?.kind === 'canada_phd') return 'Welcome back — Canada PhDs are hot right now';
    if (homeContext?.kind === 'phd') return 'Welcome back — ready for your next PhD move?';
    if (homeContext?.kind === 'jobs') return 'Welcome back — explore industry roles with research impact';
    if (homeContext?.kind === 'search') return 'Welcome back — pick up where you left off';
    return 'Find Your Next Study Opportunity';
  })();

  const greetingSub = (() => {
    if (homeContext?.kind === 'canada_phd') return 'Trending funding signals and fresh doctoral listings, tailored to your recent browsing.';
    return "Search programs, PhD positions, and jobs — with clean summaries and smart filters.";
  })();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();

    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (selectedCountry) params.set('country', selectedCountry);
    if (selectedLevel) params.set('level', selectedLevel);
    router.push(`/search?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#070B12]">
      <NavbarNext />

      <div
        className="relative bg-cover bg-center min-h-[640px] flex items-center justify-center"
        style={{
          backgroundImage:
            'linear-gradient(rgba(3, 10, 24, 0.70), rgba(3, 10, 24, 0.80)), url(https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1600)',
        }}
      >
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-[clamp(2.35rem,5vw,4rem)] font-extrabold text-white mb-4 leading-[1.05] tracking-tight">
            {greetingTitle}
          </h1>
          <p className="text-[clamp(1rem,1.8vw,1.25rem)] text-slate-200 mb-10 max-w-3xl mx-auto">
            {greetingSub}
          </p>

          <form
            onSubmit={handleSearch}
            className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl p-6 md:p-7"
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-6">
                <div className="relative">
                  <Search className="absolute left-3 top-3.5 h-5 w-5 text-white/60" />
                  <input
                    type="text"
                    placeholder="Search programs, universities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 text-white placeholder:text-white/60 border border-white/20 focus:ring-2 focus:ring-white/40 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 text-white border border-white/20 focus:ring-2 focus:ring-white/40 focus:border-transparent outline-none"
                >
                  <option value="">All Countries</option>
                  <option value="Canada">Canada</option>
                  <option value="United States">United States</option>
                  <option value="United Kingdom">United Kingdom</option>
                  <option value="Germany">Germany</option>
                  <option value="Italy">Italy</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <select
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 text-white border border-white/20 focus:ring-2 focus:ring-white/40 focus:border-transparent outline-none"
                >
                  <option value="">All Levels</option>
                  <option value="Bachelor">Bachelor</option>
                  <option value="Master">Master</option>
                  <option value="PhD">PhD</option>
                </select>
              </div>
            </div>

            {trendingTerms.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-white/70">Trending</span>
                {trendingTerms.slice(0, 6).map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => {
                      setSearchQuery(term);
                    }}
                    className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-xs text-white transition-colors"
                  >
                    {term}
                  </button>
                ))}
              </div>
            )}

            <button
              type="submit"
              className="w-full mt-5 bg-white text-[#001a35] hover:bg-white/90 font-semibold py-3 px-6 rounded-xl transition-colors duration-200 shadow-lg"
            >
              Search Programs
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
