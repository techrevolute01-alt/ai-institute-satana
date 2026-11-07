import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function publicClient(): any {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
          fetch: (input: RequestInfo | URL, init?: RequestInit) => {
            const h = new Headers(init?.headers);
            if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
            h.set("apikey", key);
            return fetch(input, { ...init, headers: h });
          },
        },
  });
}

export type CatalogPackage = {
  name: string;
  slug: string;
  desc: string;
  image: string | null;
  old: string;
  price: string;
  discount: string;
  count: number;
  features: string[];
};
export type CatalogCourse = {
  title: string;
  slug: string;
  description: string;
  instructor: string;
  duration: string;
  level: string;
  category: string;
  image: string | null;
};

const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v);

async function loadPackages(sb: ReturnType<typeof publicClient>): Promise<CatalogPackage[]> {
  const [
    { data: pkgs, error: packageError },
    { data: links, error: linksError },
    { data: incl, error: inclusionsError },
  ] = await Promise.all([
    sb
      .from("packages")
      .select("id, name, slug, description, thumbnail_url, original_price, selling_price")
      .eq("status", "published")
      .order("display_order"),
    sb.from("package_courses").select("package_id"),
    sb.from("package_inclusions").select("package_id, label, sort_order").order("sort_order"),
  ]);
  if (packageError) throw new Error(packageError.message);
  if (linksError) throw new Error(linksError.message);
  if (inclusionsError) throw new Error(inclusionsError.message);
  return (pkgs ?? []).map((p: any) => {
    const o = Number(p.original_price);
    const s = Number(p.selling_price);
    const features = (incl ?? []).filter((i: any) => i.package_id === p.id).map((i: any) => i.label);
    return {
      name: p.name,
      slug: p.slug,
      desc: p.description,
      image: p.thumbnail_url,
      old: fmt(o),
      price: fmt(s),
      discount: o > 0 ? `${Math.round((1 - s / o) * 100)}%` : "0%",
      count: (links ?? []).filter((l: any) => l.package_id === p.id).length,
      features,
    };
  });
}

export const getPublicPackages = createServerFn({ method: "GET" }).handler(async () => {
  return loadPackages(publicClient());
});

export const getPublicCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const [packages, { data: crs, error: coursesError }] = await Promise.all([
    loadPackages(sb),
    sb
      .from("courses")
      .select("title, slug, description, instructor, duration_minutes, level, category, thumbnail_url")
      .eq("status", "published")
      .order("created_at", { ascending: false }),
  ]);
  if (coursesError) throw new Error(coursesError.message);
  const courses: CatalogCourse[] = (crs ?? []).map((c: any) => ({
    title: c.title,
    slug: c.slug,
    description: c.description,
    instructor: c.instructor,
    duration: c.duration_minutes ? `${Math.round(c.duration_minutes / 60) || 1} hrs` : "Self-paced",
    level: c.level,
    category: c.category,
    image: c.thumbnail_url,
  }));
  return { packages, courses };
});
