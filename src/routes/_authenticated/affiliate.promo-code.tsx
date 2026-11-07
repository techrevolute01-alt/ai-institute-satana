import { createFileRoute } from "@tanstack/react-router";
import { requireRole } from "@/lib/auth";
import { DashboardShell } from "@/components/skillora/dashboard";
import {
  DataTable,
  PageHeader,
  StatusPill,
  money,
  pageHead,
} from "@/components/skillora/data-table";
import { useMyAffiliate } from "@/components/skillora/affiliate-data";

export const Route = createFileRoute("/_authenticated/affiliate/promo-code")({
  beforeLoad: ({ location }) => requireRole("affiliate", location.href),
  head: pageHead("Promo Code", "Your affiliate promo codes."),
  component: Page,
});

function Page() {
  const { data, isPending, error } = useMyAffiliate();
  return (
    <DashboardShell mode="affiliate">
      <PageHeader
        eyebrow="Promo Code"
        title="Your promo codes"
        description="Codes are issued by AI Institute admins. Share them with your audience."
      />
      <DataTable
        rows={data?.promoCodes}
        loading={isPending}
        error={error}
        empty="No promo codes assigned yet. Contact AI Institute to request one."
        rowKey={(r) => r.id}
        columns={[
          { label: "Code", cell: (r) => <span className="font-semibold">{r.code}</span> },
          { label: "Discount", cell: (r) => money(r.discount_value) },
          { label: "Uses", cell: (r) => r.uses },
          { label: "Status", cell: (r) => <StatusPill value={r.active ? "active" : "inactive"} /> },
        ]}
      />
    </DashboardShell>
  );
}
