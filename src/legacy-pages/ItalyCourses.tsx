import Navbar from '../components/Navbar';
import ItalyCourseList from '../components/ItalyCourseList';

export default function ItalyCoursesPage() {
  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <header className="mb-4">
          <h1 className="text-3xl font-bold text-[#002147] mb-2">Study Programs in Italy</h1>
          <p className="text-gray-600 max-w-2xl">
            Explore official courses from the Universitaly portal. Click on any program to visit the
            official page and learn more about requirements, structure, and how to apply.
          </p>
        </header>

        <ItalyCourseList />
      </main>
    </div>
  );
}
