import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/database.types';
import { GraduationCap } from 'lucide-react';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const [form, setForm] = useState<Pick<Profile, 'full_name' | 'bio'>>({ full_name: '', bio: '' });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (profile) {
      setForm({ full_name: profile.full_name ?? '', bio: profile.bio ?? '' });
      setAvatarUrl(profile.avatar_url ?? null);
    }
  }, [profile]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      setMessage('Failed to upload avatar');
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(filePath);

    setAvatarUrl(publicUrl);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setMessage(null);

    const updates: Partial<Profile> = {
      id: user.id,
      full_name: form.full_name,
      bio: form.bio,
      avatar_url: avatarUrl ?? undefined,
    };

    const { error } = await supabase.from('profiles').upsert(updates);

    if (error) {
      setMessage('Failed to save profile');
    } else {
      setMessage('Profile saved');
    }

    setSaving(false);
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-[#002147] text-xl">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <nav className="bg-[#002147] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="flex items-center space-x-2 cursor-pointer"
              onClick={() => navigate('/')}
            >
              <GraduationCap className="h-8 w-8 text-[#FF9900]" />
              <span className="text-2xl font-bold">StudyPortal</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold text-[#002147] mb-6">Your Profile</h1>

        <form onSubmit={handleSave} className="bg-white rounded-lg shadow-lg p-6 space-y-6">
          <div className="flex items-center space-x-6">
            <div className="w-24 h-24 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center text-2xl font-semibold text-[#002147]">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : profile?.full_name ? (
                profile.full_name
                  .split(' ')
                  .filter((namePart: string) => Boolean(namePart))
                  .slice(0, 2)
                  .map((namePart: string) => namePart[0]?.toUpperCase())
                  .join('')
              ) : (
                'SP'
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Avatar</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="text-sm text-gray-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002147] focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002147] focus:border-transparent outline-none"
            />
          </div>

          {message && <p className="text-sm text-gray-700">{message}</p>}

          <button
            type="submit"
            disabled={saving}
            className="bg-[#FF9900] hover:bg-[#e68a00] disabled:opacity-70 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>
    </div>
  );
}
