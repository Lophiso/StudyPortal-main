'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import type { Program } from '../../../lib/database.types';
import { MapPin, DollarSign, Clock, ArrowLeft, Building2, Calendar } from 'lucide-react';
import NavbarNext from '../../../components/NavbarNext';

export default function ProgramDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchProgram = async () => {
      const id = params?.id;
      if (!id) return;

      const programId = Number(id);
      if (!Number.isFinite(programId)) {
        setProgram(null);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.from('programs').select('*').eq('id', programId).maybeSingle();

        if (error) throw error;
        setProgram((data ?? null) as Program | null);
      } catch (error) {
        console.error('Error fetching program:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchProgram();
  }, [params]);

  const formatCurrency = (amount: number, currency: string) => {
    const symbols: { [key: string]: string } = {
      USD: '$',
      EUR: '€',
      GBP: '£',
    };
    return `${symbols[currency] || currency} ${amount.toLocaleString()}`;
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareMessage('Link copied to clipboard');
      setTimeout(() => setShareMessage(null), 2000);
    } catch {
      setShareMessage('Unable to copy link');
      setTimeout(() => setShareMessage(null), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-[#002147] text-xl">Loading program details...</div>
      </div>
    );
  }

  if (!program) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 text-lg mb-4">Program not found.</p>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="bg-[#FF9900] hover:bg-[#e68a00] text-white font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <NavbarNext />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center text-[#002147] hover:text-[#FF9900] mb-6 font-medium transition-colors"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-[#002147] to-[#003d7a] text-white p-8">
                <div className="flex items-start justify-between mb-4">
                  <span className="inline-block px-4 py-2 text-sm font-semibold bg-[#FF9900] rounded-full">
                    {program.study_level}
                  </span>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold mb-4">{program.title}</h1>
                <div className="flex items-center text-lg">
                  <Building2 className="h-5 w-5 mr-2" />
                  <span className="font-medium">{program.university}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-[#F5F7FA] border-b">
                <div className="text-center">
                  <div className="flex justify-center mb-2">
                    <MapPin className="h-6 w-6 text-[#FF9900]" />
                  </div>
                  <div className="text-xs text-gray-600 mb-1">Location</div>
                  <div className="text-sm font-semibold text-[#002147]">{program.country}</div>
                </div>
                <div className="text-center">
                  <div className="flex justify-center mb-2">
                    <Clock className="h-6 w-6 text-[#FF9900]" />
                  </div>
                  <div className="text-xs text-gray-600 mb-1">Duration</div>
                  <div className="text-sm font-semibold text-[#002147]">{program.duration_months} months</div>
                </div>
                <div className="text-center">
                  <div className="flex justify-center mb-2">
                    <DollarSign className="h-6 w-6 text-[#FF9900]" />
                  </div>
                  <div className="text-xs text-gray-600 mb-1">Tuition</div>
                  <div className="text-sm font-semibold text-[#002147]">
                    {formatCurrency(program.tuition_fee, program.currency)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex justify-center mb-2">
                    <Calendar className="h-6 w-6 text-[#FF9900]" />
                  </div>
                  <div className="text-xs text-gray-600 mb-1">Start Date</div>
                  <div className="text-sm font-semibold text-[#002147]">Sep 2025</div>
                </div>
              </div>

              <div className="p-8">
                <h2 className="text-2xl font-bold text-[#002147] mb-4">Program Overview</h2>
                <p className="text-gray-700 leading-relaxed mb-6">{program.description}</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-lg p-6 sticky top-6">
              <div className="text-center mb-6">
                <div className="text-3xl font-bold text-[#002147] mb-2">
                  {formatCurrency(program.tuition_fee, program.currency)}
                </div>
                <div className="text-gray-600 text-sm">per year</div>
              </div>

              <button
                type="button"
                onClick={handleShare}
                className="w-full border border-gray-300 text-[#002147] hover:bg-gray-100 font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
              >
                Share Program
              </button>

              {shareMessage && <p className="text-xs text-gray-600 text-center mt-2">{shareMessage}</p>}

              <div className="border-t pt-6 mt-6">
                <h3 className="font-semibold text-[#002147] mb-4">Program Details</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Level:</span>
                    <span className="font-medium text-[#002147]">{program.study_level}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Duration:</span>
                    <span className="font-medium text-[#002147]">
                      {Math.floor(program.duration_months / 12)} year{program.duration_months >= 24 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
