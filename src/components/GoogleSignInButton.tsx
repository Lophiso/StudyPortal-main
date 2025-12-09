import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function GoogleSignInButton() {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });

      if (error) {
        console.error('Google sign-in error:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleGoogleSignIn}
      disabled={loading}
      className="w-full flex items-center justify-center space-x-2 border border-gray-300 rounded-lg py-2.5 px-4 hover:bg-gray-50 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
    >
      <span className="text-sm font-semibold text-gray-700">
        {loading ? 'Redirecting…' : 'Sign in with Google'}
      </span>
    </button>
  );
}
