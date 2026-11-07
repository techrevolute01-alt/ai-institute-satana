import { useEffect, useState } from "react";
import { redirect } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "student" | "affiliate" | "admin";
export type AuthSnapshot = { user: User; roles: AppRole[] };

export async function getAuthSnapshot(): Promise<AuthSnapshot | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: rows, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  if (roleError) throw roleError;
  return { user: data.user, roles: (rows ?? []).map((row) => row.role) };
}

export async function requireRole(role: AppRole, href: string) {
  const auth = await getAuthSnapshot();
  if (!auth) throw redirect({ to: "/login", search: { redirect: href } });
  if (!auth.roles.includes(role) && !auth.roles.includes("admin"))
    throw redirect({ to: "/unauthorized" });
  return auth;
}

export function roleHome(roles: AppRole[]) {
  if (roles.includes("admin")) return "/admin" as const;
  if (roles.includes("affiliate") && !roles.includes("student")) return "/affiliate" as const;
  return "/dashboard" as const;
}

export function authMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Something went wrong. Please try again.";
  if (/already registered|user already exists/i.test(message))
    return "An account already exists for this email.";
  if (/invalid login credentials/i.test(message)) return "The email or password is incorrect.";
  if (/email not confirmed/i.test(message)) return "Confirm your email before signing in.";
  return message;
}

export function useMyRoles() {
  const [roles, setRoles] = useState<AppRole[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      getAuthSnapshot()
        .then((s) => live && setRoles(s?.roles ?? []))
        .catch(() => live && setRoles([]));
    load();
    const { data } = supabase.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN" || e === "SIGNED_OUT" || e === "USER_UPDATED") load();
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return roles;
}
