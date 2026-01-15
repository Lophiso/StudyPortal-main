'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NavbarNext from '../../../components/NavbarNext';

export default function CanadaJobsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/canada?tab=INTERNSHIP');
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#070B12]">
      <NavbarNext />
      <main className="max-w-6xl mx-auto px-4 py-10" />
    </div>
  );
}
