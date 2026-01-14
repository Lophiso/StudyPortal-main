'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavbarNext from '../../components/NavbarNext';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import { useAuth } from '../../lib/auth';

export default function AuthPage() {
  const router = useRouter();
  const { user, loading, signIn, signUp } = useAuth();

  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.push('/');
    }
  }, [loading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (mode === 'sign_in') {
        const res = await signIn(email, password);
        if (res.error) {
          setError(res.error);
          return;
        }
        router.push('/');
        return;
      }

      const res = await signUp(email, password, fullName || undefined);
      if (res.error) {
        setError(res.error);
        return;
      }

      router.push('/');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <NavbarNext />
      <main className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-md border border-gray-100 p-6">
          <h1 className="text-2xl font-bold text-[#002147]">
            {mode === 'sign_in' ? 'Sign in' : 'Create your account'}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {mode === 'sign_in'
              ? 'Sign in to save bookmarks and personalize your feed.'
              : 'Create an account to save bookmarks and personalize your feed.'}
          </p>

          <div className="mt-6">
            <GoogleSignInButton />
          </div>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px bg-gray-200 flex-1" />
            <span className="text-xs text-gray-500">or</span>
            <div className="h-px bg-gray-200 flex-1" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'sign_up' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Full name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002147] focus:border-transparent outline-none"
                  placeholder="Jane Doe"
                  autoComplete="name"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002147] focus:border-transparent outline-none"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002147] focus:border-transparent outline-none"
                autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
                required
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#FF9900] hover:bg-[#e68a00] disabled:opacity-70 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
            >
              {submitting
                ? 'Please wait…'
                : mode === 'sign_in'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>

          <div className="mt-5 text-sm text-gray-600">
            {mode === 'sign_in' ? (
              <button
                type="button"
                onClick={() => {
                  setMode('sign_up');
                  setError(null);
                }}
                className="text-[#002147] hover:underline font-medium"
              >
                Need an account? Sign up
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode('sign_in');
                  setError(null);
                }}
                className="text-[#002147] hover:underline font-medium"
              >
                Already have an account? Sign in
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
