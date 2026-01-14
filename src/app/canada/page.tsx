'use client';

import Link from 'next/link';
import NavbarNext from '../../components/NavbarNext';

export default function CanadaLandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <NavbarNext />
      <main className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-[#002147]">Canada</h1>
        <p className="mt-2 text-sm text-gray-600">
          Explore Canada-specific PhD funding opportunities and jobs.
        </p>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            href="/canada/phd"
            className="block rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <h2 className="text-xl font-semibold text-[#002147]">Canada PhD</h2>
            <p className="mt-1 text-sm text-gray-600">Funding, assistantships, scholarships.</p>
          </Link>

          <Link
            href="/canada/jobs"
            className="block rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <h2 className="text-xl font-semibold text-[#002147]">Canada Jobs</h2>
            <p className="mt-1 text-sm text-gray-600">LMIA, skilled trades, tech & healthcare.</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
