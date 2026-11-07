import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TypedSupabaseClient } from "@/lib/supabase-types";

type Ctx = { supabase: TypedSupabaseClient; userId: string };

async function assertAdmin({ supabase, userId }: Ctx) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r: { role: string }) => r.role === "admin"))
    throw new Error("Forbidden: Admin access required");
}

export type AdminUserRow = { id: string; full_name: string; email: string | null; roles: string[] };

export const listUsersWithRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertAdmin(context);
    // RLS: admins may read all profiles and role rows.
    const [{ data: users, error: e1 }, { data: roles, error: e2 }] = await Promise.all([
      context.supabase
        .from("users")
        .select("id, full_name, email")
        .order("created_at", { ascending: false })
        .limit(500),
      context.supabase.from("user_roles").select("user_id, role"),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    return (users ?? []).map((u) => ({
      ...u,
      roles: (roles ?? []).filter((r) => r.user_id === u.id).map((r) => r.role),
    }));
  });

export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), grant: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    if (!data.grant && data.userId === context.userId)
      throw new Error("You cannot remove your own Admin role.");
    // Inserts/deletes go through RLS, which also only permits Admins.
    const q = data.grant
      ? context.supabase
          .from("user_roles")
          .upsert(
            { user_id: data.userId, role: "admin" },
            { onConflict: "user_id,role", ignoreDuplicates: true },
          )
      : context.supabase.from("user_roles").delete().eq("user_id", data.userId).eq("role", "admin");
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });
