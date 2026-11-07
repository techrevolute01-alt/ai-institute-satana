import { createFileRoute } from "@tanstack/react-router";
import { requireRole } from "@/lib/auth";
import { DashboardShell, StatCard } from "@/components/skillora/dashboard";
import {
  DataTable,
  PageHeader,
  StatusPill,
  date,
  money,
  pageHead,
} from "@/components/skillora/data-table";
import { useMyAffiliate, totals } from "@/components/skillora/affiliate-data";

export const Route = createFileRoute("/_authenticated/affiliate/commission")({
  beforeLoad: ({ location }) => requireRole("affiliate", location.href),
  head: pageHead("Commission", "Your commission records."),
  component: Page,
});

function Page() {
  const { data, isPending, error } = useMyAffiliate();
  const t = totals(data);
  return (
    <DashboardShell mode="affiliate">
      <PageHeader
        eyebrow="Commission"
        title="Commission records"
        description="Commission is recorded only for real paid orders."
      />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total referrals"
          value={isPending ? "…" : String(t.referrals)}
          note="Orders using your affiliate code"
        />
        <StatCard
          label="Successful purchases"
          value={isPending ? "…" : String(t.successfulPurchases)}
          note="Verified real payments"
        />
        <StatCard
          label="Pending commission"
          value={isPending ? "…" : money(t.pending, "INR")}
          note="Awaiting approval"
        />
        <StatCard
          label="Approved commission"
          value={isPending ? "…" : money(t.approved - t.paid, "INR")}
          note="Available or awaiting payout"
        />
        <StatCard
          label="Paid commission"
          value={isPending ? "…" : money(t.paid, "INR")}
          note="Paid through approved payouts"
        />
      </div>
      <DataTable
        rows={data?.commissions}
        loading={isPending}
        error={error}
        empty="No commission records yet."
        rowKey={(r) => r.id}
        columns={[
          { label: "Package", cell: (r) => r.package_name ?? "—" },
          {
            label: "Order",
            cell: (r) => <span className="font-mono text-xs">{r.order_id.slice(0, 8)}</span>,
          },
          {
            label: "Commission type",
            cell: (r) =>
              r.commission_type === "percentage"
                ? `${r.commission_value}%`
                : `Fixed ${money(r.commission_value, "INR")}`,
          },
          { label: "Amount", cell: (r) => money(r.amount, "INR") },
          { label: "Purchase date", cell: (r) => date(r.purchase_date ?? r.created_at) },
          { label: "Status", cell: (r) => <StatusPill value={r.status} /> },
        ]}
      />
    </DashboardShell>
  );
}
