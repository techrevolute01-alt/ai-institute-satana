import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BookOpen, Loader2, Search } from "lucide-react";
import { DashboardShell } from "@/components/skillora/dashboard";
import { requireRole } from "@/lib/auth";
import { getMyCourses } from "@/lib/student.functions";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/my-courses")({
  beforeLoad: ({ location }) => requireRole("student", location.href),
  head: () => ({
    meta: [
      { title: "My Courses — AI Institute" },
      { name: "description", content: "Review courses included in your learning journey." },
      { property: "og:title", content: "My Courses — AI Institute" },
      { property: "og:description", content: "Review courses included in your learning journey." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const load = useServerFn(getMyCourses);
  const { data, isPending, error } = useQuery({ queryKey: ["my-courses"], queryFn: () => load() });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const categories = useMemo(
    () => [...new Set((data ?? []).map((course) => course.category).filter(Boolean))].sort(),
    [data],
  );
  const filteredCourses = useMemo(
    () =>
      (data ?? []).filter((course) => {
        const matchesSearch = `${course.title} ${course.description} ${course.instructor}`
          .toLowerCase()
          .includes(search.trim().toLowerCase());
        return matchesSearch && (category === "all" || course.category === category);
      }),
    [data, search, category],
  );

  return (
    <DashboardShell mode="student">
      <div>
        <p className="text-xs font-semibold uppercase text-accent">My learning library</p>
        <h1 className="mt-2 font-display text-4xl font-bold">My courses</h1>
        <p className="mt-2 text-muted-foreground">
          Published courses available through your enrolments and eligible package purchases.
        </p>
      </div>
      {!isPending && !error && (data?.length ?? 0) > 0 && (
        <div className="mt-6 flex flex-wrap gap-3">
          <label className="relative min-w-[220px] flex-1 sm:max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search courses"
              aria-label="Search courses"
            />
          </label>
          <label className="sr-only" htmlFor="course-category">
            Filter by category
          </label>
          <select
            id="course-category"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      )}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading your courses…
          </p>
        ) : error ? (
          <p className="text-sm text-destructive">
            {error.message || "Could not load your courses."}
          </p>
        ) : filteredCourses.length ? (
          filteredCourses.map((course) => (
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
                <div className="grid aspect-video place-items-center bg-paper text-muted-foreground">
                  <BookOpen className="size-10" />
                </div>
              )}
              <div className="grid gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-xl font-semibold">{course.title}</h2>
                  <span className="shrink-0 rounded-full bg-paper px-2 py-1 text-[10px] font-semibold uppercase text-accent ring-1 ring-ink/10">
                    {course.accessStatus}
                  </span>
                </div>
                <p className="line-clamp-3 text-sm text-muted-foreground">{course.description}</p>
                {course.instructor && (
                  <p className="text-xs text-muted-foreground">Instructor: {course.instructor}</p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{course.publishedLessonCount} published lessons</span>
                  <span>{course.duration_minutes} min course</span>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span>Course progress</span>
                    <span>{course.progressPercent}%</span>
                  </div>
                  <Progress value={course.progressPercent} />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {course.completedLessonsCount} of {course.publishedLessonCount} lessons complete
                  </p>
                  {course.lastAccessedLessonTitle && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Last accessed: {course.lastAccessedLessonTitle}
                    </p>
                  )}
                </div>
                <Link
                  to="/learn/$courseId"
                  params={{ courseId: course.id }}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  {course.lastAccessedAt ? "Continue learning" : "Start learning"}{" "}
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </article>
          ))
        ) : data?.length ? (
          <div className="rounded-lg bg-surface p-6 ring-1 ring-ink/15">
            <h2 className="font-semibold">No matching courses</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different search or category.
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-surface p-6 ring-1 ring-ink/15">
            <h2 className="font-semibold">No courses available yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Published courses appear here when you have an enrolment or a paid package that
              includes them.
            </p>
            <Link
              to="/packages"
              className="mt-4 inline-flex text-sm font-semibold text-accent underline"
            >
              Browse packages
            </Link>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
