import { createFileRoute } from "@tanstack/react-router";
import { requireRole } from "@/lib/auth";
import { DashboardShell } from "@/components/skillora/dashboard";
import {
  DataTable,
  PageHeader,
  StatusPill,
  date,
  money,
  pageHead,
} from "@/components/skillora/data-table";
import { useMyAffiliate } from "@/components/skillora/affiliate-data";

export const Route = createFileRoute("/_authenticated/affiliate/sales")({
  beforeLoad: ({ location }) => requireRole("affiliate", location.href),
  head: pageHead("Sales", "Orders attributed to you."),
  component: Page,
});

function Page() {
  const { data, isPending, error } = useMyAffiliate();
  return (
    <DashboardShell mode="affiliate">
      <PageHeader
        eyebrow="Sales"
        title="Attributed sales"
        description="Paid orders linked to your referral link or promo code."
      />
      <DataTable
        rows={data?.commissions}
        loading={isPending}
        error={error}
        empty="No attributed sales yet."
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
          { label: "Date", cell: (r) => date(r.purchase_date ?? r.created_at) },
          { label: "Your commission", cell: (r) => money(r.amount, "INR") },
          { label: "Status", cell: (r) => <StatusPill value={r.status} /> },
        ]}
      />
    </DashboardShell>
  );
}
