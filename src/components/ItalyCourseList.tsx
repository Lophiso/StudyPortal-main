import italyCourses from '../data/italy-courses.json';

interface ItalyCourse {
  courseName: string;
  universityName: string;
  degreeType: string;
  duration: string;
  language: string;
  link: string | null;
}

const courses = (italyCourses as ItalyCourse[]).filter((c) => c.link);

export default function ItalyCourseList() {
  if (!courses.length) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-[#002147] mb-2">Italy Courses</h2>
        <p className="text-gray-600 text-sm">
          No Italy course data available yet. Run the scraping script to populate this list.
        </p>
      </div>
    );
  }

  return (
    <section className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold text-[#002147] mb-4">Italy Courses</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((course, idx) => (
          <article
            key={`${course.courseName}-${course.universityName}-${idx}`}
            className="border border-gray-200 rounded-lg p-4 flex flex-col justify-between hover:shadow-md transition-shadow duration-200"
          >
            <div>
              <h3 className="text-lg font-semibold text-[#002147] mb-1 line-clamp-2">
                {course.courseName}
              </h3>
              {course.universityName && (
                <p className="text-sm text-gray-700 mb-1">{course.universityName}</p>
              )}

              <div className="text-xs text-gray-600 space-y-1 mt-2">
                {course.degreeType && (
                  <p>
                    <span className="font-medium">Degree type:</span> {course.degreeType}
                  </p>
                )}
                {course.duration && (
                  <p>
                    <span className="font-medium">Duration:</span> {course.duration}
                  </p>
                )}
                {course.language && (
                  <p>
                    <span className="font-medium">Language:</span> {course.language}
                  </p>
                )}
              </div>
            </div>

            {course.link && (
              <a
                href={course.link}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center justify-center rounded-md bg-[#FF9900] px-3 py-2 text-sm font-semibold text-white hover:bg-[#e68a00] transition-colors"
              >
                Visit Official Page
              </a>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
