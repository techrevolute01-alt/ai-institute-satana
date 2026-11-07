import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type StudentCourseRow = {
  id: string;
  title: string;
  slug: string;
  description: string;
  thumbnail_url: string | null;
  instructor: string;
  category: string;
  duration_minutes: number;
};

type StudentCourse = StudentCourseRow & {
  publishedLessonCount: number;
  completedLessonsCount: number;
  progressPercent: number;
  lastAccessedAt: string | null;
  lastLessonId: string | null;
  lastAccessedLessonTitle: string | null;
  accessStatus: "Enrolled" | "Package access";
};

type LessonProgress = {
  completed: boolean;
  completed_at: string | null;
  progress_seconds: number;
  updated_at: string;
};
type CourseSection = { id: string; course_id: string; title: string; sort_order: number };
type StudentLesson = {
  id: string;
  section_id: string;
  title: string;
  description: string;
  video_path: string | null;
  duration_minutes: number;
  sort_order: number;
  status: string;
};
type DatabaseError = { message: string };
type DatabaseResult<T> = { data: T | null; error: DatabaseError | null };
type StudentQuery<T> = PromiseLike<DatabaseResult<T[]>> & {
  select(columns: string): StudentQuery<T>;
  eq(column: string, value: string): StudentQuery<T>;
  in(column: string, values: string[]): StudentQuery<T>;
  order(column: string): StudentQuery<T>;
  maybeSingle(): PromiseLike<DatabaseResult<T>>;
};
type StudentDatabaseClient = {
  rpc(name: "my_accessible_course_ids"): PromiseLike<DatabaseResult<{ course_id: string }[]>>;
  rpc(
    name: "record_lesson_progress",
    args: { _lesson_id: string; _completed: boolean; _progress_seconds: number },
  ): PromiseLike<DatabaseResult<unknown>>;
  storage: {
    from(bucket: "course-videos"): {
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): PromiseLike<DatabaseResult<{ signedUrl: string }>>;
    };
  };
  from(table: "courses"): StudentQuery<StudentCourseRow>;
  from(table: "course_sections"): StudentQuery<CourseSection>;
  from(table: "lessons"): StudentQuery<StudentLesson>;
  from(table: "enrollments"): StudentQuery<{ course_id: string }>;
  from(table: "lesson_progress"): StudentQuery<{
    lesson_id: string;
    completed: boolean;
    completed_at: string | null;
    progress_seconds: number;
    updated_at: string;
  }>;
};

export type StudentPlayer = {
  course: StudentCourseRow;
  sections: {
    id: string;
    title: string;
    lessons: {
      completed: boolean;
      progress_seconds: number;
      id: string;
      title: string;
      description: string;
      video_path: string | null;
      duration_minutes: number;
      sort_order: number;
      last_accessed_at: string | null;
    }[];
  }[];
};

async function getAccessibleCourseIds(supabase: StudentDatabaseClient) {
  const { data, error } = await supabase.rpc("my_accessible_course_ids");
  if (error) throw new Error(error.message);
  return new Set<string>((data ?? []).map((row: { course_id: string }) => row.course_id));
}

async function getAccessibleStudentCourses(
  supabase: StudentDatabaseClient,
  userId: string,
): Promise<{
  courses: StudentCourse[];
  recentCompletedLessons: {
    courseId: string;
    courseTitle: string;
    lessonId: string;
    lessonTitle: string;
    completedAt: string;
  }[];
}> {
  const courseIds = await getAccessibleCourseIds(supabase);
  if (courseIds.size === 0) return { courses: [], recentCompletedLessons: [] };

  const { data: courses, error: coursesError } = await supabase
    .from("courses")
    .select(
      "id, title, slug, description, thumbnail_url, instructor, category, duration_minutes, status",
    )
    .in("id", [...courseIds])
    .eq("status", "published")
    .order("title");
  if (coursesError) throw new Error(coursesError.message);
  if (!courses?.length) return { courses: [], recentCompletedLessons: [] };

  const { data: sections, error: sectionsError } = await supabase
    .from("course_sections")
    .select("id, course_id, title, sort_order")
    .in(
      "course_id",
      courses.map((course) => course.id),
    )
    .order("sort_order");
  if (sectionsError) throw new Error(sectionsError.message);
  const sectionToCourse = new Map(
    (sections ?? []).map((section) => [section.id, section.course_id]),
  );
  const sectionIds = [...sectionToCourse.keys()];

  const [{ data: lessons, error: lessonsError }, { data: enrollments, error: enrollmentError }] =
    await Promise.all([
      sectionIds.length
        ? supabase
            .from("lessons")
            .select(
              "id, section_id, title, description, video_path, duration_minutes, sort_order, status",
            )
            .in("section_id", sectionIds)
            .eq("status", "published")
            .order("sort_order")
        : Promise.resolve({ data: [], error: null }),
      supabase.from("enrollments").select("course_id").eq("user_id", userId),
    ]);
  if (lessonsError) throw new Error(lessonsError.message);
  if (enrollmentError) throw new Error(enrollmentError.message);

  const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
  const { data: progress, error: progressError } = lessonIds.length
    ? await supabase
        .from("lesson_progress")
        .select("lesson_id, completed, completed_at, progress_seconds, updated_at")
        .eq("user_id", userId)
        .in("lesson_id", lessonIds)
    : { data: [], error: null };
  if (progressError) throw new Error(progressError.message);

  const progressByLesson = new Map((progress ?? []).map((row) => [row.lesson_id, row]));
  const enrolledCourseIds = new Set((enrollments ?? []).map((row) => row.course_id));
  const lessonStats = new Map<
    string,
    {
      published: number;
      completed: number;
      last: { lesson_id: string; updated_at: string } | undefined;
    }
  >();

  for (const lesson of lessons ?? []) {
    const courseId = sectionToCourse.get(lesson.section_id);
    if (!courseId) continue;
    const stats = lessonStats.get(courseId) ?? { published: 0, completed: 0, last: undefined };
    const lessonProgress = progressByLesson.get(lesson.id);
    stats.published += 1;
    if (lessonProgress?.completed) stats.completed += 1;
    if (
      lessonProgress &&
      (!stats.last || Date.parse(lessonProgress.updated_at) > Date.parse(stats.last.updated_at))
    ) {
      stats.last = lessonProgress;
    }
    lessonStats.set(courseId, stats);
  }

  const accessibleCourses = courses.map((course) => {
    const stats = lessonStats.get(course.id);
    const publishedLessonCount = stats?.published ?? 0;
    const completedLessonsCount = stats?.completed ?? 0;
    return {
      ...course,
      instructor: course.instructor ?? "",
      category: course.category ?? "",
      publishedLessonCount,
      completedLessonsCount,
      progressPercent: publishedLessonCount
        ? Math.round((completedLessonsCount / publishedLessonCount) * 100)
        : 0,
      lastAccessedAt: stats?.last?.updated_at ?? null,
      lastLessonId: stats?.last
        ? ((lessons ?? []).find((lesson) => lesson.id === stats.last?.lesson_id)?.id ?? null)
        : null,
      lastAccessedLessonTitle: stats?.last
        ? ((lessons ?? []).find((lesson) => lesson.id === stats.last?.lesson_id)?.title ?? null)
        : null,
      accessStatus: enrolledCourseIds.has(course.id)
        ? ("Enrolled" as const)
        : ("Package access" as const),
    };
  });
  const courseTitles = new Map(accessibleCourses.map((course) => [course.id, course.title]));
  const lessonById = new Map((lessons ?? []).map((lesson) => [lesson.id, lesson]));
  const recentCompletedLessons = (progress ?? [])
    .filter((row) => row.completed && row.completed_at)
    .map((row) => {
      const lesson = lessonById.get(row.lesson_id);
      const courseId = lesson ? sectionToCourse.get(lesson.section_id) : undefined;
      const courseTitle = courseId ? courseTitles.get(courseId) : undefined;
      return lesson && courseId && courseTitle
        ? {
            courseId,
            courseTitle,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            completedAt: row.completed_at!,
          }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
    .slice(0, 8);
  return { courses: accessibleCourses, recentCompletedLessons };
}

export const getMyCourses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudentCourse[]> => {
    const sb = context.supabase as unknown as StudentDatabaseClient;
    const { courses } = await getAccessibleStudentCourses(sb, context.userId);
    return courses;
  });

export const getStudentPlayer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ courseId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<StudentPlayer> => {
    const sb = context.supabase as unknown as StudentDatabaseClient;
    const courseIds = await getAccessibleCourseIds(sb);
    if (!courseIds.has(data.courseId)) throw new Error("You do not have access to this course.");

    const { data: course, error: courseError } = await sb
      .from("courses")
      .select("id, title, slug, description, thumbnail_url, instructor, category, duration_minutes")
      .eq("id", data.courseId)
      .eq("status", "published")
      .maybeSingle();
    if (courseError) throw new Error(courseError.message);
    if (!course) throw new Error("This course is not published or is unavailable.");

    const { data: sections, error: sectionsError } = await sb
      .from("course_sections")
      .select("id, title, sort_order")
      .eq("course_id", data.courseId)
      .order("sort_order");
    if (sectionsError) throw new Error(sectionsError.message);

    const sectionIds = (sections ?? []).map((section) => section.id);
    if (sectionIds.length === 0) return { course, sections: [] };

    const { data: lessons, error: lessonsError } = await sb
      .from("lessons")
      .select("id, section_id, title, description, video_path, duration_minutes, sort_order")
      .in("section_id", sectionIds)
      .eq("status", "published")
      .order("sort_order");
    if (lessonsError) throw new Error(lessonsError.message);

    const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
    const { data: progress, error: progressError } = lessonIds.length
      ? await sb
          .from("lesson_progress")
          .select("lesson_id, completed, completed_at, progress_seconds, updated_at")
          .eq("user_id", context.userId)
          .in("lesson_id", lessonIds)
      : { data: [], error: null };
    if (progressError) throw new Error(progressError.message);

    const progressByLesson = new Map<string, LessonProgress>(
      (progress ?? []).map((row) => [
        row.lesson_id,
        {
          completed: row.completed,
          completed_at: row.completed_at,
          progress_seconds: row.progress_seconds,
          updated_at: row.updated_at,
        },
      ]),
    );
    return {
      course,
      sections: await Promise.all(
        (sections ?? []).map(async (section) => ({
          id: section.id,
          title: section.title,
          lessons: await Promise.all(
            (lessons ?? [])
              .filter((lesson) => lesson.section_id === section.id)
              .map(async (lesson) => ({
                ...lesson,
                video_path: lesson.video_path?.startsWith("course-videos/")
                  ? await getStudentVideoUrl(sb, lesson.video_path)
                  : lesson.video_path,
                ...(progressByLesson.get(lesson.id) ?? {
                  completed: false,
                  completed_at: null,
                  progress_seconds: 0,
                  updated_at: "",
                }),
                last_accessed_at: progressByLesson.get(lesson.id)?.updated_at ?? null,
              })),
          ),
        })),
      ),
    };
  });

async function getStudentVideoUrl(supabase: StudentDatabaseClient, videoPath: string) {
  const objectPath = videoPath.slice("course-videos/".length);
  const { data, error } = await supabase.storage
    .from("course-videos")
    .createSignedUrl(objectPath, 3600);
  if (error) throw new Error(error.message);
  if (!data?.signedUrl) throw new Error("Could not authorize playback for this lesson.");
  return data.signedUrl;
}

export const saveStudentLessonProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        lessonId: z.string().uuid(),
        completed: z.boolean(),
        progressSeconds: z.number().int().min(0).max(86_400),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sb = context.supabase as unknown as StudentDatabaseClient;
    const { error } = await sb.rpc("record_lesson_progress", {
      _lesson_id: data.lessonId,
      _completed: data.completed,
      _progress_seconds: data.progressSeconds,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordStudentLessonAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ lessonId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase as unknown as StudentDatabaseClient;
    const { error } = await sb.rpc("record_lesson_progress", {
      _lesson_id: data.lessonId,
      _completed: false,
      _progress_seconds: 0,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type StudentOverview = {
  fullName: string;
  packagesCount: number;
  coursesCount: number;
  completedCoursesCount: number;
  certificatesCount: number;
  continueLearning: { courseId: string; title: string; progress: number }[];
  coursesInProgress: StudentCourse[];
  completedCourses: StudentCourse[];
  enrolledCourses: StudentCourse[];
  overallLearningProgress: number;
  recentCompletedLessons: {
    courseId: string;
    courseTitle: string;
    lessonId: string;
    lessonTitle: string;
    completedAt: string;
  }[];
  recentActivity: {
    courseId: string;
    courseTitle: string;
    lessonId: string | null;
    accessedAt: string;
    completedLessonsCount: number;
    publishedLessonCount: number;
  }[];
};

export const getStudentOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudentOverview> => {
    const { supabase, userId } = context;

    const [{ data: profile, error: profileError }, { courses, recentCompletedLessons }] =
      await Promise.all([
        supabase.from("users").select("full_name").eq("id", userId).maybeSingle(),
        getAccessibleStudentCourses(supabase as unknown as StudentDatabaseClient, userId),
      ]);
    if (profileError) throw new Error(profileError.message);

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "paid");
    if (ordersError) throw new Error(ordersError.message);
    const orderIds = (orders ?? []).map((o) => o.id);
    let packagesCount = 0;
    if (orderIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select("package_id")
        .in("order_id", orderIds)
        .not("package_id", "is", null);
      if (itemsError) throw new Error(itemsError.message);
      packagesCount = new Set((items ?? []).map((i) => i.package_id)).size;
    }

    const { count: certificatesCount, error: certificatesError } = await supabase
      .from("certificates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (certificatesError) throw new Error(certificatesError.message);

    const coursesInProgress = courses.filter(
      (course) => course.lastAccessedAt !== null && course.progressPercent < 100,
    );
    const completedCourses = courses.filter(
      (course) => course.publishedLessonCount > 0 && course.progressPercent === 100,
    );
    const continueLearning = [
      ...coursesInProgress,
      ...courses.filter((course) => course.progressPercent === 0),
    ]
      .sort(
        (a, b) =>
          Date.parse(b.lastAccessedAt ?? "") - Date.parse(a.lastAccessedAt ?? "") ||
          a.title.localeCompare(b.title),
      )
      .slice(0, 5)
      .map((course) => ({
        courseId: course.id,
        title: course.title,
        progress: course.progressPercent,
      }));
    const recentActivity = courses
      .filter((course) => course.lastAccessedAt)
      .sort((a, b) => Date.parse(b.lastAccessedAt ?? "") - Date.parse(a.lastAccessedAt ?? ""))
      .slice(0, 8)
      .map((course) => ({
        courseId: course.id,
        courseTitle: course.title,
        lessonId: course.lastLessonId,
        lessonTitle: course.lastAccessedLessonTitle,
        accessedAt: course.lastAccessedAt!,
        completedLessonsCount: course.completedLessonsCount,
        publishedLessonCount: course.publishedLessonCount,
      }));
    const totalPublishedLessons = courses.reduce(
      (total, course) => total + course.publishedLessonCount,
      0,
    );
    const totalCompletedLessons = courses.reduce(
      (total, course) => total + course.completedLessonsCount,
      0,
    );

    return {
      fullName: profile?.full_name ?? "Learner",
      packagesCount,
      coursesCount: courses.length,
      completedCoursesCount: completedCourses.length,
      certificatesCount: certificatesCount ?? 0,
      continueLearning,
      coursesInProgress,
      completedCourses,
      enrolledCourses: courses,
      overallLearningProgress: totalPublishedLessons
        ? Math.round((totalCompletedLessons / totalPublishedLessons) * 100)
        : 0,
      recentCompletedLessons,
      recentActivity,
    };
  });
