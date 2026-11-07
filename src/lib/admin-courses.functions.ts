import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TypedSupabaseClient } from "@/lib/supabase-types";

async function assertAdmin(ctx: { supabase: TypedSupabaseClient; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  if (error) throw new Error(`Could not verify admin access: ${error.message}`);
  if (!(data ?? []).some((r: { role: string }) => r.role === "admin"))
    throw new Error("Forbidden: Admin access required");
}

export const courseSchema = z.object({
  title: z.string().trim().min(2, "Course title is required").max(160),
  description: z.string().trim().min(1, "Description is required").max(4000),
  instructor: z.string().trim().min(1, "Instructor is required").max(120),
  category: z.string().trim().min(1, "Category is required").max(80),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]),
  duration_minutes: z.number({ message: "Enter a valid number" }).int().min(0).max(100000),
  thumbnail_url: z.string().trim().url("Thumbnail must be a valid URL").max(1000).or(z.literal("")),
  status: z.enum(["published", "draft", "archived"]),
});
export type CourseInput = z.infer<typeof courseSchema>;
export type AdminCourse = CourseInput & { id: string; slug: string };

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "course";

export const listAdminCourses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminCourse[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("courses")
      .select(
        "id, slug, title, description, instructor, category, level, duration_minutes, thumbnail_url, status",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((c) => ({
      ...c,
      level:
        c.level === "Beginner" || c.level === "Intermediate" || c.level === "Advanced"
          ? c.level
          : "Beginner",
      thumbnail_url: c.thumbnail_url ?? "",
    }));
  });

export const saveCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid().optional(), values: courseSchema }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const row = { ...data.values, thumbnail_url: data.values.thumbnail_url || null };
    const slug = `${slugify(row.title)}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const { error } = data.id
      ? await context.supabase.from("courses").update(row).eq("id", data.id)
      : await context.supabase.from("courses").insert({ ...row, slug });
    if (error) {
      if (error.code === "23505") {
        throw new Error("A course with this generated URL already exists. Please try again.");
      }
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("courses").delete().eq("id", data.id);
    if (error)
      throw new Error(
        error.code === "23503"
          ? "This course is linked to packages, enrollments or orders. Remove it from packages or archive it instead."
          : error.message,
      );
    return { ok: true };
  });

// ---------- Course detail: sections, lessons, packages ----------
export type CourseLesson = {
  id: string;
  section_id: string;
  title: string;
  description: string;
  video_path: string | null;
  duration_minutes: number;
  status: "draft" | "published" | "archived";
  sort_order: number;
};
export type CourseSection = {
  id: string;
  title: string;
  sort_order: number;
  lessons: CourseLesson[];
};
export type CourseDetail = {
  sections: CourseSection[];
  packages: { id: string; name: string; status: string; linked: boolean }[];
};

export const getCourseDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ courseId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<CourseDetail> => {
    await assertAdmin(context);
    const sb = context.supabase;
    const [s, p, l] = await Promise.all([
      sb
        .from("course_sections")
        .select(
          "id, title, sort_order, lessons(id, section_id, title, description, video_path, duration_minutes, status, sort_order)",
        )
        .eq("course_id", data.courseId)
        .order("sort_order"),
      sb.from("packages").select("id, name, status").order("display_order"),
      sb.from("package_courses").select("package_id").eq("course_id", data.courseId),
    ]);
    for (const r of [s, p, l]) if (r.error) throw new Error(r.error.message);
    const linked = new Set((l.data ?? []).map((x) => x.package_id));
    return {
      sections: (s.data ?? []).map((x) => ({
        ...x,
        lessons: [...(x.lessons ?? [])].sort((a, b) => a.sort_order - b.sort_order),
      })),
      packages: (p.data ?? []).map((x) => ({ ...x, linked: linked.has(x.id) })),
    };
  });

export const saveSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        courseId: z.string().uuid(),
        title: z.string().trim().min(1, "Section title is required").max(160),
        sort_order: z.number().int().min(0).max(10000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const row = { title: data.title, sort_order: data.sort_order };
    const { error } = data.id
      ? await context.supabase.from("course_sections").update(row).eq("id", data.id)
      : await context.supabase.from("course_sections").insert({ ...row, course_id: data.courseId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { count } = await context.supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("section_id", data.id);
    if (count) throw new Error("Delete or move the lessons in this section first.");
    const { error } = await context.supabase.from("course_sections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const lessonSchema = z
  .object({
    title: z.string().trim().min(1, "Lesson title is required").max(160),
    description: z.string().trim().min(1, "Lesson description is required").max(4000),
    video_path: z
      .string()
      .trim()
      .max(1000)
      .refine((value) => {
        if (
          /^course-videos\/courses\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-zA-Z0-9_-]+\.(mp4|webm)$/i.test(
            value,
          )
        ) {
          return true;
        }
        try {
          const url = new URL(value);
          return url.protocol === "https:" && !url.username && !url.password;
        } catch {
          return false;
        }
      }, "Choose a valid uploaded video path or HTTPS video URL.")
      .or(z.literal("")),
    duration_minutes: z.number({ message: "Enter a valid number" }).int().min(0).max(10000),
    status: z.enum(["draft", "published", "archived"]),
    sort_order: z.number().int().min(0).max(10000),
  })
  .superRefine((lesson, ctx) => {
    if (lesson.status === "published" && !lesson.video_path) {
      ctx.addIssue({
        code: "custom",
        path: ["video_path"],
        message: "Add a video URL before publishing.",
      });
    }
  });

export const getAdminLessonVideoUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ videoPath: z.string().min(1).max(1000) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const prefix = "course-videos/";
    if (!data.videoPath.startsWith(prefix)) {
      throw new Error("Invalid course video storage path.");
    }
    const objectPath = data.videoPath.slice(prefix.length);
    const { data: signed, error } = await context.supabase.storage
      .from("course-videos")
      .createSignedUrl(objectPath, 3600);
    if (error) throw new Error(error.message);
    if (!signed?.signedUrl) throw new Error("Could not create a preview link for this video.");
    return { signedUrl: signed.signedUrl };
  });

export const saveLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        sectionId: z.string().uuid(),
        values: lessonSchema,
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { data: section, error: sectionError } = await context.supabase
      .from("course_sections")
      .select("id")
      .eq("id", data.sectionId)
      .maybeSingle();
    if (sectionError) throw new Error(sectionError.message);
    if (!section) throw new Error("Course section not found.");
    const row = {
      ...data.values,
      video_path: data.values.video_path || null,
      section_id: data.sectionId,
    };
    const { error } = data.id
      ? await context.supabase.from("lessons").update(row).eq("id", data.id)
      : await context.supabase.from("lessons").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), direction: z.enum(["up", "down"]) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const reorderClient = context.supabase as unknown as {
      rpc(
        name: "reorder_course_lesson",
        args: { _lesson_id: string; _direction: number },
      ): PromiseLike<{ error: { message: string } | null }>;
    };
    const { error } = await reorderClient.rpc("reorder_course_lesson", {
      _lesson_id: data.id,
      _direction: data.direction === "up" ? -1 : 1,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("lessons").delete().eq("id", data.id);
    if (error)
      throw new Error(
        error.code === "23503"
          ? "This lesson has student progress, resources or quizzes linked. Remove those first."
          : error.message,
      );
    return { ok: true };
  });
