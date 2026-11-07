import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { requireRole } from "@/lib/auth";
import { getAdminOverview } from "@/lib/admin.functions";
import { DashboardShell, StatCard } from "@/components/skillora/dashboard";
export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Admin Panel — AI Institute" },
      {
        name: "description",
        content: "AI Institute administration shell for learning operations and reporting.",
      },
      { property: "og:title", content: "Admin Panel — AI Institute" },
      {
        property: "og:description",
        content: "AI Institute administration shell for learning operations and reporting.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: ({ location }) => requireRole("admin", location.href),
  component: Page,
});
function money(v: number, c = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: c,
    maximumFractionDigits: 2,
  }).format(v);
}
function Page() {
  const { data, isPending } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => getAdminOverview(),
  });
  const v = (n: number | undefined) => (isPending ? "…" : String(n ?? 0));
  const revenue = data?.recentOrders[0]?.currency ?? "USD";
  return (
    <DashboardShell mode="admin">
      <p className="text-xs font-semibold uppercase text-accent">Operations overview</p>
      <h1 className="mt-2 font-display text-4xl font-bold">AI Institute administration</h1>
      <p className="mt-2 text-muted-foreground">
        Manage learning operations from one structured workspace.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total students"
          value={v(data?.totalStudents)}
          note="Registered learners"
        />
        <StatCard
          label="Total affiliates"
          value={v(data?.totalAffiliates)}
          note="Affiliate accounts"
        />
        <StatCard label="Total packages" value={v(data?.totalPackages)} note="Learning packages" />
        <StatCard label="Total courses" value={v(data?.totalCourses)} note="Published and draft" />
        <StatCard label="Total orders" value={v(data?.totalOrders)} note="All statuses" />
        <StatCard
          label="Total revenue"
          value={isPending ? "…" : money(data?.totalRevenue ?? 0, revenue)}
          note="Paid orders"
        />
      </div>
      <section className="mt-8 rounded-lg bg-surface p-6 border border-line">
        <h2 className="font-display text-2xl font-bold">Recent orders</h2>
        {isPending ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading orders…</p>
        ) : (data?.recentOrders.length ?? 0) === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No orders yet. Orders will appear here once students start purchasing packages.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-ink/10">
            {data!.recentOrders.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">#{o.id.slice(0, 8)}</span>
                <span className="font-semibold">{money(o.total, o.currency)}</span>
                <span className="rounded-full bg-background px-2.5 py-0.5 text-xs font-semibold uppercase ring-1 ring-ink/20">
                  {o.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}
