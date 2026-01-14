'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MapPin, Clock, Search, Heart } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Program } from '../../lib/database.types';
import NavbarNext from '../../components/NavbarNext';
import { useAuth } from '../../lib/auth';

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
          <div className="text-[#002147] text-xl">Loading programs...</div>
        </div>
      }
    >
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const [programs, setPrograms] = useState<Program[]>([]);
  const [filteredPrograms, setFilteredPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [maxTuition, setMaxTuition] = useState<number>(100000);
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [bookmarkedProgramIds, setBookmarkedProgramIds] = useState<number[]>([]);
  const [bookmarkBusyId, setBookmarkBusyId] = useState<number | null>(null);

  const searchParamsString = searchParams.toString();

  useEffect(() => {
    const fetchPrograms = async () => {
      try {
        const { data, error } = await supabase.from('programs').select('*').order('title');

        if (error) throw error;
        setPrograms((data ?? []) as Program[]);
      } catch (error) {
        console.error('Error fetching programs:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchPrograms();
  }, []);

  useEffect(() => {
    const fetchBookmarks = async () => {
      if (!user) {
        setBookmarkedProgramIds([]);
        return;
      }

      const { data, error: bookmarksError } = await supabase
        .from('bookmarks')
        .select('program_id')
        .eq('user_id', user.id);

      if (bookmarksError) {
        console.error('Error fetching bookmarks:', bookmarksError);
        return;
      }

      const rows = (data ?? []) as Array<{ program_id: number }>;
      setBookmarkedProgramIds(rows.map((b) => b.program_id));
    };

    void fetchBookmarks();
  }, [user]);

  useEffect(() => {
    const applyFilters = () => {
      let filtered = [...programs];

      const query = searchParams.get('q')?.toLowerCase();
      if (query) {
        filtered = filtered.filter(
          (p) =>
            p.title.toLowerCase().includes(query) ||
            p.university.toLowerCase().includes(query) ||
            p.description.toLowerCase().includes(query),
        );
      }

      const urlCountry = searchParams.get('country');
      if (urlCountry) {
        filtered = filtered.filter((p) => p.country === urlCountry);
      } else if (selectedCountries.length > 0) {
        filtered = filtered.filter((p) => selectedCountries.includes(p.country));
      }

      const urlLevel = searchParams.get('level');
      const levelFilter = urlLevel || selectedLevel;
      if (levelFilter) {
        filtered = filtered.filter((p) => p.study_level === levelFilter);
      }

      filtered = filtered.filter((p) => {
        let feeInUSD = p.tuition_fee;
        if (p.currency === 'GBP') feeInUSD *= 1.27;
        if (p.currency === 'EUR') feeInUSD *= 1.08;
        return feeInUSD <= maxTuition;
      });

      setFilteredPrograms(filtered);
    };

    applyFilters();
  }, [programs, selectedCountries, maxTuition, selectedLevel, searchParamsString, searchParams]);

  const availableCountries = useMemo(() => Array.from(new Set(programs.map((p) => p.country))), [programs]);

  const handleCountryToggle = (country: string) => {
    setSelectedCountries((prev) => (prev.includes(country) ? prev.filter((c) => c !== country) : [...prev, country]));
  };

  const formatCurrency = (amount: number, currency: string) => {
    const symbols: { [key: string]: string } = {
      USD: '$',
      EUR: '€',
      GBP: '£',
    };
    return `${symbols[currency] || currency} ${amount.toLocaleString()}`;
  };

  const toggleBookmark = async (programId: number) => {
    if (!user) {
      router.push('/auth');
      return;
    }

    setBookmarkBusyId(programId);

    const isBookmarked = bookmarkedProgramIds.includes(programId);

    try {
      if (isBookmarked) {
        const { error: deleteError } = await supabase
          .from('bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('program_id', programId);

        if (deleteError) throw deleteError;

        setBookmarkedProgramIds((prev) => prev.filter((id) => id !== programId));
      } else {
        const { error: insertError } = await supabase.from('bookmarks').insert({
          user_id: user.id,
          program_id: programId,
        });

        if (insertError) throw insertError;

        setBookmarkedProgramIds((prev) => [...prev, programId]);
      }
    } catch (bookmarkError) {
      console.error('Error updating bookmark:', bookmarkError);
    } finally {
      setBookmarkBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-[#002147] text-xl">Loading programs...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <NavbarNext />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#002147] mb-2">Search Results</h1>
          <p className="text-gray-600">
            Found {filteredPrograms.length} program{filteredPrograms.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-6 sticky top-6">
              <div className="flex items-center mb-4">
                <Search className="h-5 w-5 text-[#002147] mr-2" />
                <h2 className="text-lg font-semibold text-[#002147]">Filters</h2>
              </div>

              <div className="mb-6">
                <h3 className="font-semibold text-[#002147] mb-3">Country</h3>
                <div className="space-y-2">
                  {availableCountries.map((country) => (
                    <label key={country} className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCountries.includes(country)}
                        onChange={() => handleCountryToggle(country)}
                        className="w-4 h-4 text-[#FF9900] border-gray-300 rounded focus:ring-[#FF9900]"
                      />
                      <span className="ml-2 text-gray-700">{country}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <h3 className="font-semibold text-[#002147] mb-3">Max Tuition (USD)</h3>
                <input
                  type="range"
                  min="0"
                  max="100000"
                  step="5000"
                  value={maxTuition}
                  onChange={(e) => setMaxTuition(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#FF9900]"
                />
                <div className="text-sm text-gray-600 mt-2">Up to ${maxTuition.toLocaleString()}</div>
              </div>

              <div className="mb-4">
                <h3 className="font-semibold text-[#002147] mb-3">Study Level</h3>
                <select
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002147] focus:border-transparent outline-none"
                >
                  <option value="">All Levels</option>
                  <option value="Bachelor">Bachelor</option>
                  <option value="Master">Master</option>
                  <option value="PhD">PhD</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedCountries([]);
                  setMaxTuition(100000);
                  setSelectedLevel('');
                }}
                className="w-full text-sm text-[#FF9900] hover:text-[#e68a00] font-medium"
              >
                Clear All Filters
              </button>
            </div>
          </div>

          <div className="lg:col-span-3">
            {filteredPrograms.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-12 text-center">
                <p className="text-gray-600 text-lg">No programs found matching your criteria.</p>
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="mt-4 bg-[#FF9900] hover:bg-[#e68a00] text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  Back to Home
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredPrograms.map((program) => (
                  <div
                    key={program.id}
                    className="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow duration-200 overflow-hidden cursor-pointer"
                    onClick={() => router.push(`/program/${program.id}`)}
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <span className="inline-block px-3 py-1 text-xs font-semibold text-white bg-[#002147] rounded-full">
                          {program.study_level}
                        </span>
                        <div className="flex items-center space-x-2">
                          <span className="text-[#FF9900] font-bold text-lg">
                            {formatCurrency(program.tuition_fee, program.currency)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void toggleBookmark(program.id);
                            }}
                            disabled={bookmarkBusyId === program.id}
                            className="text-[#FF9900] hover:text-[#e68a00] disabled:opacity-60"
                            aria-label={
                              bookmarkedProgramIds.includes(program.id) ? 'Remove bookmark' : 'Save program'
                            }
                          >
                            <Heart
                              className="h-5 w-5"
                              fill={bookmarkedProgramIds.includes(program.id) ? '#FF9900' : 'none'}
                            />
                          </button>
                        </div>
                      </div>

                      <h3 className="text-xl font-bold text-[#002147] mb-2 line-clamp-2">{program.title}</h3>

                      <p className="text-gray-700 font-medium mb-3">{program.university}</p>

                      <div className="space-y-2 text-sm text-gray-600 mb-4">
                        <div className="flex items-center">
                          <MapPin className="h-4 w-4 mr-2 text-gray-400" />
                          <span>{program.country}</span>
                        </div>
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-2 text-gray-400" />
                          <span>{program.duration_months} months</span>
                        </div>
                      </div>

                      <p className="text-gray-600 text-sm line-clamp-2 mb-4">{program.description}</p>

                      <button className="w-full bg-[#FF9900] hover:bg-[#e68a00] text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200">
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
