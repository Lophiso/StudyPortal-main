'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, BookOpen, Briefcase, Scale, FlaskConical, GraduationCap, Globe, Heart } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Program } from '../lib/database.types';
import NavbarNext from '../components/NavbarNext';
import { useAuth } from '../lib/auth';

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookmarkedProgramIds, setBookmarkedProgramIds] = useState<number[]>([]);
  const [bookmarkBusyId, setBookmarkBusyId] = useState<number | null>(null);

  useEffect(() => {
    const fetchPrograms = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: supabaseError } = await supabase
          .from('programs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(12);

        if (supabaseError) {
          throw supabaseError;
        }

        setPrograms((data ?? []) as Program[]);
      } catch (err) {
        console.error('Error fetching programs:', err);
        setError('Failed to load programs. Please try again later.');
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();

    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (selectedCountry) params.set('country', selectedCountry);
    if (selectedLevel) params.set('level', selectedLevel);
    router.push(`/search?${params.toString()}`);
  };

  const disciplines = [
    { name: 'Engineering', icon: FlaskConical, color: 'bg-blue-500' },
    { name: 'Business', icon: Briefcase, color: 'bg-green-500' },
    { name: 'Law', icon: Scale, color: 'bg-purple-500' },
    { name: 'Sciences', icon: BookOpen, color: 'bg-red-500' },
    { name: 'Arts & Humanities', icon: Globe, color: 'bg-yellow-500' },
    { name: 'Medicine', icon: GraduationCap, color: 'bg-pink-500' },
  ];

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

  return (
    <div className="min-h-screen bg-white">
      <NavbarNext />

      <div
        className="relative bg-cover bg-center h-[600px] flex items-center justify-center"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0, 33, 71, 0.75), rgba(0, 33, 71, 0.75)), url(https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1600)',
        }}
      >
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Find Your Perfect Study Program
          </h1>
          <p className="text-xl text-gray-200 mb-12">
            Discover thousands of Bachelor's and Master's programs worldwide
          </p>

          <form onSubmit={handleSearch} className="bg-white rounded-lg shadow-2xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-6">
                <div className="relative">
                  <Search className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search programs, universities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002147] focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002147] focus:border-transparent outline-none bg-white"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002147] focus:border-transparent outline-none bg-white"
                >
                  <option value="">All Levels</option>
                  <option value="Bachelor">Bachelor</option>
                  <option value="Master">Master</option>
                  <option value="PhD">PhD</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-4 bg-[#FF9900] hover:bg-[#e68a00] text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 shadow-lg"
            >
              Search Programs
            </button>
          </form>
        </div>
      </div>

      <div className="bg-[#F5F7FA] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-[#002147] text-center mb-12">
            Browse by Discipline
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {disciplines.map((discipline) => (
              <div
                key={discipline.name}
                className="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow duration-200 p-6 cursor-pointer group"
                onClick={() => router.push(`/search?q=${encodeURIComponent(discipline.name)}`)}
              >
                <div className={`${discipline.color} w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200`}>
                  <discipline.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-[#002147] mb-2">{discipline.name}</h3>
                <p className="text-gray-600">Explore programs in {discipline.name}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold text-[#002147]">Latest Programs</h2>
            <button
              type="button"
              onClick={() => router.push('/search')}
              className="text-[#002147] hover:text-[#FF9900] font-semibold"
            >
              View All →
            </button>
          </div>

          {loading && <p className="text-gray-600 text-sm">Loading programs…</p>}
          {error && !loading && <p className="text-sm text-red-600 mb-4">{error}</p>}

          {!loading && !error && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {programs.map((program) => {
                const isBookmarked = bookmarkedProgramIds.includes(program.id);
                const busy = bookmarkBusyId === program.id;

                return (
                  <div
                    key={program.id}
                    className="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow duration-200 overflow-hidden"
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-xl font-semibold text-[#002147] mb-1 line-clamp-2">
                            {program.title}
                          </h3>
                          <p className="text-gray-600 text-sm">{program.university}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void toggleBookmark(program.id)}
                          disabled={busy}
                          className="shrink-0 p-2 rounded-lg hover:bg-gray-100 disabled:opacity-60"
                          aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
                        >
                          <Heart
                            className={`h-5 w-5 ${
                              isBookmarked ? 'fill-[#FF9900] text-[#FF9900]' : 'text-gray-400'
                            }`}
                          />
                        </button>
                      </div>

                      <p className="text-gray-700 text-sm mb-4 line-clamp-2">
                        {program.description}
                      </p>

                      <div className="text-xs text-gray-600 mb-4">
                        {program.country} · {program.study_level}
                      </div>

                      <button
                        type="button"
                        onClick={() => router.push(`/program/${program.id}`)}
                        className="w-full bg-[#002147] hover:bg-[#001a35] text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
