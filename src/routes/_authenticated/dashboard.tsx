import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Clock3 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getStudentOverview } from "@/lib/student.functions";
import { DashboardShell, StatCard } from "@/components/skillora/dashboard";
import { Progress } from "@/components/ui/progress";
import { AffiliateActivateCard } from "@/components/skillora/affiliate-activate";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Student Dashboard — AI Institute" },
      {
        name: "description",
        content: "Track courses, packages, activity, and certificates in AI Institute.",
      },
      { property: "og:title", content: "Student Dashboard — AI Institute" },
      {
        property: "og:description",
        content: "Track courses, packages, activity, and certificates in AI Institute.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: ({ location }) => requireRole("student", location.href),
  component: Page,
});
function Page() {
  const { data, isPending, error } = useQuery({
    queryKey: ["student-overview"],
    queryFn: () => getStudentOverview(),
  });
  const v = (n: number | undefined) => (isPending ? "…" : String(n ?? 0));
  const name = data?.fullName ?? "learner";
  return (
    <DashboardShell mode="student">
      <p className="text-xs font-semibold uppercase text-accent">Student dashboard</p>
      <h1 className="mt-2 font-display text-4xl font-bold">Welcome back, {name}.</h1>
      <p className="mt-2 text-muted-foreground">Continue building momentum one lesson at a time.</p>
      {error && (
        <p
          role="alert"
          className="mt-6 rounded-md bg-surface p-4 text-sm text-destructive ring-1 ring-ink/10"
        >
          {error.message}
        </p>
      )}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="My packages" value={v(data?.packagesCount)} note="Purchased packages" />
        <StatCard label="My courses" value={v(data?.coursesCount)} note="Courses you can access" />
        <StatCard
          label="In progress"
          value={v(data?.coursesInProgress.length)}
          note="Courses with saved lesson progress"
        />
        <StatCard
          label="Completed"
          value={v(data?.completedCoursesCount)}
          note="All published lessons completed"
        />
        <StatCard
          label="Overall progress"
          value={`${v(data?.overallLearningProgress)}%`}
          note="Completed published lessons"
        />
        <StatCard
          label="Certificates"
          value={v(data?.certificatesCount)}
          note="Earned certificates"
        />
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-accent">
              Pick up where you left off
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold">Continue learning</h2>
          </div>
          <Button asChild variant="outline">
            <Link to="/my-courses">
              All my courses <ArrowRight />
            </Link>
          </Button>
        </div>
        {isPending ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading your learning data…</p>
        ) : data?.continueLearning.length ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.continueLearning.map((course) => {
              const detail = data.enrolledCourses.find((item) => item.id === course.courseId);
              return (
                <article
                  key={course.courseId}
                  className="overflow-hidden rounded-lg bg-surface ring-1 ring-ink/15"
                >
                  {detail?.thumbnail_url ? (
                    <img
                      src={detail.thumbnail_url}
                      alt=""
                      className="aspect-video w-full object-cover"
                    />
                  ) : (
                    <div className="grid aspect-video place-items-center bg-paper text-accent">
                      <BookOpen className="size-9" />
                    </div>
                  )}
                  <div className="grid gap-3 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-lg font-semibold">{course.title}</h3>
                      <span className="text-sm font-semibold">{course.progress}%</span>
                    </div>
                    <Progress value={course.progress} />
                    <p className="text-xs text-muted-foreground">
                      {detail?.completedLessonsCount ?? 0} of {detail?.publishedLessonCount ?? 0}{" "}
                      lessons complete
                    </p>
                    <Link
                      to="/learn/$courseId"
                      params={{ courseId: course.courseId }}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
                    >
                      Continue course <ArrowRight className="size-4" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-lg bg-surface p-6 ring-1 ring-ink/15">
            <h3 className="font-semibold">Your learning starts here</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {data?.enrolledCourses.length
                ? "Open one of your courses to start a lesson. Your latest lesson will be remembered here."
                : "Courses included in your enrolments or paid packages will appear here."}
            </p>
            {data?.enrolledCourses.length ? (
              <Link
                to="/my-courses"
                className="mt-3 inline-flex text-sm font-semibold text-accent hover:underline"
              >
                Browse my courses <ArrowRight className="ml-1 size-4" />
              </Link>
            ) : (
              <Link
                to="/packages"
                className="mt-3 inline-flex text-sm font-semibold text-accent hover:underline"
              >
                Explore packages <ArrowRight className="ml-1 size-4" />
              </Link>
            )}
          </div>
        )}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-surface p-5 ring-1 ring-ink/15">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold">Recently accessed</h2>
            <Clock3 className="size-5 text-accent" />
          </div>
          {data?.recentActivity.length ? (
            <ul className="mt-3 divide-y divide-ink/10">
              {data.recentActivity.slice(0, 5).map((activity) => (
                <li
                  key={activity.courseId}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold">{activity.courseTitle}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(activity.accessedAt).toLocaleString()} ·{" "}
                      {activity.completedLessonsCount}/{activity.publishedLessonCount} lessons
                      complete
                    </p>
                  </div>
                  <Link
                    to="/learn/$courseId"
                    params={{ courseId: activity.courseId }}
                    className="text-sm font-semibold text-accent hover:underline"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Courses you open will appear here using your saved lesson activity.
            </p>
          )}
        </div>
        <div className="rounded-lg bg-surface p-5 ring-1 ring-ink/15">
          <h2 className="font-display text-xl font-bold">Completed courses</h2>
          {data?.completedCourses.length ? (
            <ul className="mt-3 grid gap-2">
              {data.completedCourses.map((course) => (
                <li
                  key={course.id}
                  className="flex items-center justify-between gap-3 border-b border-ink/10 py-2"
                >
                  <span className="text-sm font-semibold">{course.title}</span>
                  <span className="text-xs text-success">Complete</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              A course will be listed here after you complete all its published lessons.
            </p>
          )}
        </div>
      </section>
      <section className="mt-8 rounded-lg bg-surface p-5 ring-1 ring-ink/15">
        <h2 className="font-display text-xl font-bold">Recently completed lessons</h2>
        {data?.recentCompletedLessons.length ? (
          <ul className="mt-3 divide-y divide-ink/10">
            {data.recentCompletedLessons.slice(0, 5).map((lesson) => (
              <li
                key={lesson.lessonId}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div>
                  <p className="text-sm font-semibold">{lesson.lessonTitle}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {lesson.courseTitle} · {new Date(lesson.completedAt).toLocaleString()}
                  </p>
                </div>
                <Link
                  to="/learn/$courseId"
                  params={{ courseId: lesson.courseId }}
                  className="text-sm font-semibold text-accent hover:underline"
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Completed lessons will appear here after you mark them complete.
          </p>
        )}
      </section>
      <AffiliateActivateCard />
    </DashboardShell>
  );
}
