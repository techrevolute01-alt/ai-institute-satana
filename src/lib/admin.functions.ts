import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminOverview = {
  totalStudents: number;
  totalAffiliates: number;
  totalPackages: number;
  totalCourses: number;
  totalOrders: number;
  totalRevenue: number;
  recentOrders: {
    id: string;
    total: number;
    currency: string;
    status: string;
    created_at: string;
  }[];
};

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverview> => {
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r) => r.role);
    if (!roles.includes("admin")) throw new Response("Forbidden", { status: 403 });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      { count: studentCount },
      { count: affiliateCount },
      { count: packageCount },
      { count: courseCount },
      { count: orderCount },
    ] = await Promise.all([
      supabaseAdmin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "student"),
      supabaseAdmin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "affiliate"),
      supabaseAdmin.from("packages").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("courses").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }),
    ]);
    const totalStudents = studentCount ?? 0;
    const totalAffiliates = affiliateCount ?? 0;
    const totalPackages = packageCount ?? 0;
    const totalCourses = courseCount ?? 0;
    const totalOrders = orderCount ?? 0;

    const { data: paidOrders } = await supabaseAdmin
      .from("orders")
      .select("total")
      .eq("status", "paid");
    const totalRevenue = (paidOrders ?? []).reduce((sum, o) => sum + Number(o.total ?? 0), 0);

    const { data: recent } = await supabaseAdmin
      .from("orders")
      .select("id, total, currency, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    return {
      totalStudents,
      totalAffiliates,
      totalPackages,
      totalCourses,
      totalOrders,
      totalRevenue,
      recentOrders: (recent ?? []).map((o) => ({
        id: o.id,
        total: Number(o.total ?? 0),
        currency: o.currency,
        status: o.status,
        created_at: o.created_at,
      })),
    };
  });
