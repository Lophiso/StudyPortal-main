import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, User } from 'lucide-react';
import { useAuth } from '../lib/auth';

export default function Navbar() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const initials = profile?.full_name
    ?.split(' ')
    .filter((part) => part)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'SP';

  const handleSignOut = async () => {
    await signOut();
    setMenuOpen(false);
    navigate('/');
  };

  return (
    <nav className="bg-[#002147] text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <GraduationCap className="h-8 w-8 text-[#FF9900]" />
            <span className="text-2xl font-bold">StudyPortal</span>
          </Link>

          <div className="hidden md:flex items-center space-x-6">
            <Link to="/universities" className="hover:text-[#FF9900] transition-colors">
              Universities
            </Link>
            <Link to="/about" className="hover:text-[#FF9900] transition-colors">
              About
            </Link>
            <Link to="/contact" className="hover:text-[#FF9900] transition-colors">
              Contact
            </Link>

            {!user ? (
              <button
                type="button"
                onClick={() => navigate('/auth')}
                className="bg-white text-[#002147] font-semibold py-2 px-4 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Sign In
              </button>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-white text-[#002147] font-semibold overflow-hidden"
                >
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm flex items-center justify-center w-full h-full">
                      {initials || <User className="w-5 h-5" />}
                    </span>
                  )}
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white text-[#002147] rounded-lg shadow-lg py-2 z-20">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate('/profile');
                      }}
                      className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                    >
                      Profile
                    </button>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
