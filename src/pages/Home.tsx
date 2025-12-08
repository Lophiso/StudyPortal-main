import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, BookOpen, Briefcase, Scale, FlaskConical, GraduationCap, Globe } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Program } from '../lib/database.types';
import Navbar from '../components/Navbar';

export default function Home() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        setPrograms(data ?? []);
      } catch (err) {
        console.error('Error fetching programs:', err);
        setError('Failed to load programs. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    void fetchPrograms();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (selectedCountry) params.set('country', selectedCountry);
    if (selectedLevel) params.set('level', selectedLevel);
    navigate(`/search?${params.toString()}`);
  };

  const disciplines = [
    { name: 'Engineering', icon: FlaskConical, color: 'bg-blue-500' },
    { name: 'Business', icon: Briefcase, color: 'bg-green-500' },
    { name: 'Law', icon: Scale, color: 'bg-purple-500' },
    { name: 'Sciences', icon: BookOpen, color: 'bg-red-500' },
    { name: 'Arts & Humanities', icon: Globe, color: 'bg-yellow-500' },
    { name: 'Medicine', icon: GraduationCap, color: 'bg-pink-500' },
  ];

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section */}
      <div
        className="relative bg-cover bg-center h-[600px] flex items-center justify-center"
        style={{
          backgroundImage: 'linear-gradient(rgba(0, 33, 71, 0.75), rgba(0, 33, 71, 0.75)), url(https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1600)',
        }}
      >
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Find Your Perfect Study Program
          </h1>
          <p className="text-xl text-gray-200 mb-12">
            Discover thousands of Bachelor's and Master's programs worldwide
          </p>

          {/* Search Box */}
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
                  <option value="United States">United States</option>
                  <option value="United Kingdom">United Kingdom</option>
                  <option value="Germany">Germany</option>
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

      {/* Browse by Discipline */}
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
                onClick={() => navigate(`/search?q=${discipline.name}`)}
              >
                <div className={`${discipline.color} w-16 h-16 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200`}>
                  <discipline.icon className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-[#002147] mb-2">{discipline.name}</h3>
                <p className="text-gray-600">Explore programs in {discipline.name.toLowerCase()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Latest Programs */}
      <div className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold text-[#002147]">Latest Programs</h2>
            <button
              type="button"
              className="text-[#FF9900] font-semibold hover:text-[#e68a00]"
              onClick={() => navigate('/search')}
            >
              View all programs
            </button>
          </div>

          {loading && (
            <p className="text-gray-600">Loading programs...</p>
          )}

          {!loading && error && (
            <p className="text-red-600">{error}</p>
          )}

          {!loading && !error && programs.length === 0 && (
            <p className="text-gray-600">No programs found. Add some data to your Supabase `programs` table.</p>
          )}

          {!loading && !error && programs.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {programs.map((program) => (
                <div
                  key={program.id}
                  className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 p-6 cursor-pointer"
                  onClick={() => navigate(`/program/${program.id}`)}
                >
                  <h3 className="text-xl font-semibold text-[#002147] mb-1">{program.title}</h3>
                  <p className="text-gray-600 mb-2">{program.university}</p>
                  <p className="text-gray-500 text-sm mb-3">
                    {program.country}  b7 {program.study_level}
                  </p>
                  <p className="text-[#FF9900] font-semibold mb-2">
                    {program.tuition_fee.toLocaleString(undefined, {
                      style: 'currency',
                      currency: program.currency || 'EUR',
                      maximumFractionDigits: 0,
                    })}
                    {program.duration_months && (
                      <span className="text-gray-500 text-sm ml-2">
                        / {Math.round(program.duration_months / 12)} year(s)
                      </span>
                    )}
                  </p>
                  <p className="text-gray-600 text-sm line-clamp-3">
                    {program.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats Section */}
      <div className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-[#FF9900] mb-2">10,000+</div>
              <div className="text-gray-600 text-lg">Study Programs</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-[#FF9900] mb-2">2,500+</div>
              <div className="text-gray-600 text-lg">Universities</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-[#FF9900] mb-2">150+</div>
              <div className="text-gray-600 text-lg">Countries</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-[#002147] text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-gray-400">&copy; 2024 StudyPortal. Find your future.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
