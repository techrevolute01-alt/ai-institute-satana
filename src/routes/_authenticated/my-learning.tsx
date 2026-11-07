import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Clock3, Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/skillora/dashboard";
import { Progress } from "@/components/ui/progress";
import { requireRole } from "@/lib/auth";
import { getStudentOverview } from "@/lib/student.functions";
export const Route = createFileRoute("/_authenticated/my-learning")({
  beforeLoad: ({ location }) => requireRole("student", location.href),
  head: () => ({
    meta: [
      { title: "My Learning — AI Institute" },
      { name: "description", content: "Your enrolled lessons and progress." },
      { property: "og:title", content: "My Learning — AI Institute" },
      { property: "og:description", content: "Your enrolled lessons and progress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { data, isPending, error } = useQuery({
    queryKey: ["student-overview"],
    queryFn: () => getStudentOverview(),
  });

  return (
    <DashboardShell mode="student">
      <p className="text-xs font-semibold uppercase text-accent">Learning activity</p>
      <h1 className="mt-2 font-display text-4xl font-bold">My Learning</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Continue your in-progress courses, revisit recent lessons, and see your completed learning.
      </p>

      {isPending ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading your learning activity…
        </p>
      ) : error ? (
        <p
          role="alert"
          className="mt-6 rounded-md bg-surface p-4 text-sm text-destructive ring-1 ring-ink/10"
        >
          {error.message}
        </p>
      ) : data ? (
        <>
          <section className="mt-8">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-accent">
                  Pick up where you left off
                </p>
                <h2 className="mt-1 font-display text-2xl font-bold">Courses in progress</h2>
              </div>
              <Link to="/my-courses" className="text-sm font-semibold text-accent hover:underline">
                All courses
              </Link>
            </div>
            {data.coursesInProgress.length ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.coursesInProgress.map((course) => (
                  <article
                    key={course.id}
                    className="overflow-hidden rounded-lg bg-surface ring-1 ring-ink/15"
                  >
                    {course.thumbnail_url ? (
                      <img
                        src={course.thumbnail_url}
                        alt=""
                        className="aspect-video w-full object-cover"
                      />
                    ) : (
                      <div className="grid aspect-video place-items-center bg-paper text-accent">
                        <BookOpen className="size-9" />
                      </div>
                    )}
                    <div className="grid gap-3 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-display text-lg font-semibold">{course.title}</h3>
                        <span className="text-sm font-semibold">{course.progressPercent}%</span>
                      </div>
                      <Progress value={course.progressPercent} />
                      <p className="text-xs text-muted-foreground">
                        {course.completedLessonsCount} of {course.publishedLessonCount} published
                        lessons complete
                      </p>
                      <Link
                        to="/learn/$courseId"
                        params={{ courseId: course.id }}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
                      >
                        Continue course <ArrowRight className="size-4" />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-lg bg-surface p-5 text-sm text-muted-foreground ring-1 ring-ink/15">
                No courses in progress. Open an available course to begin a lesson.
              </p>
            )}
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg bg-surface p-5 ring-1 ring-ink/15">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-bold">Recent learning activity</h2>
                <Clock3 className="size-5 text-accent" />
              </div>
              {data.recentActivity.length ? (
                <ul className="mt-3 divide-y divide-ink/10">
                  {data.recentActivity.map((activity) => (
                    <li
                      key={activity.courseId}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold">{activity.courseTitle}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(activity.accessedAt).toLocaleString()}
                        </p>
                      </div>
                      <Link
                        to="/learn/$courseId"
                        params={{ courseId: activity.courseId }}
                        className="text-sm font-semibold text-accent hover:underline"
                      >
                        Resume
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Lessons you open will appear here with their latest saved activity.
                </p>
              )}
            </div>
            <div className="rounded-lg bg-surface p-5 ring-1 ring-ink/15">
              <h2 className="font-display text-xl font-bold">Completed courses</h2>
              {data.completedCourses.length ? (
                <ul className="mt-3 divide-y divide-ink/10">
                  {data.completedCourses.map((course) => (
                    <li key={course.id} className="flex items-center justify-between gap-3 py-3">
                      <span className="text-sm font-semibold">{course.title}</span>
                      <span className="text-xs font-semibold text-success">Complete</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Courses will appear here when every published lesson is marked complete.
                </p>
              )}
            </div>
          </section>
        </>
      ) : null}
    </DashboardShell>
  );
}
