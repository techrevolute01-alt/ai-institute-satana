import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TypedSupabaseClient } from "@/lib/supabase-types";

async function assertAdmin(ctx: { supabase: TypedSupabaseClient; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  if (!(data ?? []).some((r: { role: string }) => r.role === "admin"))
    throw new Error("Forbidden: Admin access required");
}

export type CourseLite = {
  id: string;
  title: string;
  instructor: string;
  category: string;
  level: string;
  status: string;
};

export const getPackageAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ packageId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const [{ data: courses, error: e1 }, { data: links, error: e2 }] = await Promise.all([
      context.supabase
        .from("courses")
        .select("id, title, instructor, category, level, status")
        .order("title"),
      context.supabase
        .from("package_courses")
        .select("course_id, sort_order")
        .eq("package_id", data.packageId)
        .order("sort_order"),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    return {
      courses: (courses ?? []) as CourseLite[],
      assignedIds: (links ?? []).map((l) => l.course_id),
    };
  });

export const assignCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ packageId: z.string().uuid(), courseId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { count } = await context.supabase
      .from("package_courses")
      .select("id", { count: "exact", head: true })
      .eq("package_id", data.packageId);
    const { error } = await context.supabase
      .from("package_courses")
      .insert({ package_id: data.packageId, course_id: data.courseId, sort_order: count ?? 0 });
    if (error)
      throw new Error(
        error.code === "23505" ? "This course is already in the package." : error.message,
      );
    return { ok: true };
  });

export const assignCourses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        packageId: z.string().uuid(),
        courseIds: z.array(z.string().uuid()).min(1, "Select at least one course").max(200),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { data: existing, error: e1 } = await context.supabase
      .from("package_courses")
      .select("course_id")
      .eq("package_id", data.packageId);
    if (e1) throw new Error(e1.message);
    const have = new Set((existing ?? []).map((r: { course_id: string }) => r.course_id));
    const fresh = [...new Set(data.courseIds)].filter((id) => !have.has(id));
    if (!fresh.length) return { added: 0 };
    const rows = fresh.map((course_id, i) => ({
      package_id: data.packageId,
      course_id,
      sort_order: have.size + i,
    }));
    const { error } = await context.supabase
      .from("package_courses")
      .upsert(rows, { onConflict: "package_id,course_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { added: fresh.length };
  });

export const unassignCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ packageId: z.string().uuid(), courseId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("package_courses")
      .delete()
      .eq("package_id", data.packageId)
      .eq("course_id", data.courseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type PublicPackage = {
  id: string;
  slug: string;
  name: string;
  description: string;
  thumbnail_url: string | null;
  original_price: number;
  selling_price: number;
  features: string[];
  courses: {
    slug: string;
    title: string;
    description: string;
    level: string;
    duration_minutes: number;
  }[];
  includedPackages: { slug: string; name: string }[];
};

// Public read: RLS only exposes published packages/courses.
export const getPublicPackage = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<PublicPackage | null> => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const sb = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: pkg, error: packageError } = await sb
      .from("packages")
      .select("id, slug, name, description, thumbnail_url, original_price, selling_price")
      .eq("slug", data.slug)
      .eq("status", "published")
      .maybeSingle();
    if (packageError) throw new Error(packageError.message);
    if (!pkg) return null;
    // Resolve included packages transitively (RLS only returns published links).
    const { data: edges, error: edgesError } = await sb
      .from("package_includes")
      .select("package_id, included_package_id, sort_order")
      .order("sort_order");
    if (edgesError) throw new Error(edgesError.message);
    const all = (edges ?? []) as { package_id: string; included_package_id: string }[];
    const seen = new Set<string>([pkg.id]);
    const order: string[] = [];
    const stack = [pkg.id];
    while (stack.length) {
      const cur = stack.shift()!;
      for (const e of all)
        if (e.package_id === cur && !seen.has(e.included_package_id)) {
          seen.add(e.included_package_id);
          order.push(e.included_package_id);
          stack.push(e.included_package_id);
        }
    }
    const direct = all.filter((e) => e.package_id === pkg.id).map((e) => e.included_package_id);
    const { data: incPkgs, error: includedPackagesError } = direct.length
      ? await sb
          .from("packages")
          .select("id, slug, name")
          .in("id", direct)
          .eq("status", "published")
      : { data: [] as { id: string; slug: string; name: string }[] };
    if (includedPackagesError) throw new Error(includedPackagesError.message);
    const [{ data: links, error: linksError }, { data: inclusions, error: inclusionsError }] =
      await Promise.all([
        sb
      .from("package_courses")
      .select("package_id, sort_order, courses(slug, title, description, level, duration_minutes, status)")
      .in("package_id", [pkg.id, ...order])
          .order("sort_order"),
        sb
          .from("package_inclusions")
          .select("package_id, label, sort_order")
          .in("package_id", [pkg.id, ...order])
          .order("sort_order"),
      ]);
    if (linksError) throw new Error(linksError.message);
    if (inclusionsError) throw new Error(inclusionsError.message);
    const rank = new Map([pkg.id, ...order].map((id, i) => [id, i]));
    const sorted = [...(links ?? [])].sort(
      (a, b) => rank.get(a.package_id)! - rank.get(b.package_id)! || a.sort_order - b.sort_order,
    );
    const dedup = new Map<
      string,
      { slug: string; title: string; description: string; level: string; duration_minutes: number }
    >();
    for (const l of sorted) {
      const c = l.courses;
      if (c && c.status === "published" && !dedup.has(c.slug))
        dedup.set(c.slug, {
          slug: c.slug,
          title: c.title,
          description: c.description,
          level: c.level,
          duration_minutes: c.duration_minutes,
        });
    }
    return {
      id: pkg.id,
      slug: pkg.slug,
      name: pkg.name,
      description: pkg.description,
      thumbnail_url: pkg.thumbnail_url,
      original_price: Number(pkg.original_price),
      selling_price: Number(pkg.selling_price),
      features: (inclusions ?? [])
        .sort(
          (a, b) =>
            (rank.get(a.package_id) ?? 0) - (rank.get(b.package_id) ?? 0) ||
            a.sort_order - b.sort_order,
        )
        .map((inclusion) => inclusion.label),
      courses: [...dedup.values()],
      includedPackages: direct
        .map((id) => (incPkgs ?? []).find((p) => p.id === id))
        .filter(Boolean)
        .map((p) => ({ slug: p!.slug, name: p!.name })),
    };
  });
