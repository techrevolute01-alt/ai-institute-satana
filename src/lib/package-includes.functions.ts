import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TypedSupabaseClient } from "@/lib/supabase-types";

async function assertAdmin(ctx: { supabase: TypedSupabaseClient; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  if (!(data ?? []).some((r: { role: string }) => r.role === "admin"))
    throw new Error("Forbidden: Admin access required");
}

type Edge = { package_id: string; included_package_id: string };

/** All packages reachable from `start` through inclusions (excluding start). */
export function descendants(start: string, edges: Edge[]): Set<string> {
  const out = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const e of edges)
      if (
        e.package_id === cur &&
        !out.has(e.included_package_id) &&
        e.included_package_id !== start
      ) {
        out.add(e.included_package_id);
        stack.push(e.included_package_id);
      }
  }
  return out;
}

export const getPackageIncludes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ packageId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const [{ data: pkgs, error: e1 }, { data: edges, error: e2 }] = await Promise.all([
      context.supabase.from("packages").select("id, name, status").order("name"),
      context.supabase
        .from("package_includes")
        .select("package_id, included_package_id, sort_order")
        .order("sort_order"),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    const all = (edges ?? []) as Edge[];
    const includedIds = all
      .filter((e) => e.package_id === data.packageId)
      .map((e) => e.included_package_id);
    // Packages that already (directly or indirectly) include this one would create a loop.
    const blocked = new Set<string>([data.packageId]);
    for (const p of pkgs ?? []) if (descendants(p.id, all).has(data.packageId)) blocked.add(p.id);
    return {
      packages: (pkgs ?? []) as { id: string; name: string; status: string }[],
      includedIds,
      blockedIds: [...blocked],
    };
  });

export const addPackageInclude = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ packageId: z.string().uuid(), includedId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    if (data.packageId === data.includedId) throw new Error("A package cannot include itself.");
    const { count } = await context.supabase
      .from("package_includes")
      .select("id", { count: "exact", head: true })
      .eq("package_id", data.packageId);
    const { error } = await context.supabase.from("package_includes").insert({
      package_id: data.packageId,
      included_package_id: data.includedId,
      sort_order: count ?? 0,
    });
    if (error) {
      if (error.code === "23505") throw new Error("This package is already included.");
      if (/circular/i.test(error.message))
        throw new Error("This would create a circular package dependency.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const removePackageInclude = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ packageId: z.string().uuid(), includedId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("package_includes")
      .delete()
      .eq("package_id", data.packageId)
      .eq("included_package_id", data.includedId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
