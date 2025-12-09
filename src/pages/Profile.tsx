import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/database.types';
import Navbar from '../components/Navbar';

type EditableProfileFields = Pick<
  Profile,
  'full_name' | 'bio' | 'education_level' | 'study_interests' | 'phone_number'
>;

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const [form, setForm] = useState<EditableProfileFields>({
    full_name: '',
    bio: '',
    education_level: '',
    study_interests: '',
    phone_number: '',
  });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;

    // Prefer saved profile values, otherwise fall back to Google metadata where available
    const metadata = (user.user_metadata || {}) as {
      full_name?: string;
      name?: string;
      picture?: string;
      avatar_url?: string;
      phone?: string;
    };

    const googleName = profile?.full_name ?? metadata.full_name ?? metadata.name ?? '';
    const googleAvatar = profile?.avatar_url ?? metadata.avatar_url ?? metadata.picture ?? null;

    setForm({
      full_name: googleName,
      bio: profile?.bio ?? '',
      education_level: profile?.education_level ?? '',
      study_interests: profile?.study_interests ?? '',
      phone_number: profile?.phone_number ?? metadata.phone ?? '',
    });

    setAvatarUrl(googleAvatar);
  }, [profile, user]);

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
      education_level: form.education_level || null,
      study_interests: form.study_interests || null,
      phone_number: form.phone_number || null,
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
      <Navbar />

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
            <label className="block text-sm font-medium text-gray-700 mb-1">Education level</label>
            <input
              type="text"
              value={form.education_level ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, education_level: e.target.value }))}
              placeholder="e.g. High School, Undergraduate, Graduate"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002147] focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Study interests</label>
            <textarea
              value={form.study_interests ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, study_interests: e.target.value }))}
              rows={3}
              placeholder="What would you like to study?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002147] focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
            <input
              type="tel"
              value={form.phone_number ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
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
