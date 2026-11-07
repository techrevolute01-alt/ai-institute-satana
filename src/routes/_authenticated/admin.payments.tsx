import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { requireRole } from "@/lib/auth";
import { listPayments, type PaymentRow } from "@/lib/admin-ops.functions";
import { DashboardShell } from "@/components/skillora/dashboard";
import {
  DataTable,
  PageHeader,
  StatusPill,
  date,
  money,
  pageHead,
} from "@/components/skillora/data-table";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  beforeLoad: ({ location }) => requireRole("admin", location.href),
  head: pageHead("Payments", "Review payment records."),
  component: Page,
});

function Page() {
  const list = useServerFn(listPayments);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-payments"],
    queryFn: () => list(),
  });
  return (
    <DashboardShell mode="admin">
      <PageHeader
        eyebrow="Payments"
        title="Payment records"
        description="Payment records come from the payment provider once it is connected. Nothing is marked paid manually."
      />
      <DataTable<PaymentRow>
        rows={data}
        loading={isPending}
        error={error}
        empty="No payment records yet."
        rowKey={(r) => r.id}
        columns={[
          {
            label: "Order",
            cell: (r) => <span className="font-mono text-xs">{r.order_id.slice(0, 8)}</span>,
          },
          { label: "Provider", cell: (r) => r.provider ?? "—" },
          { label: "Reference", cell: (r) => r.provider_reference ?? "—" },
          { label: "Amount", cell: (r) => money(r.amount) },
          { label: "Paid", cell: (r) => date(r.paid_at) },
          { label: "Status", cell: (r) => <StatusPill value={r.status} /> },
        ]}
      />
    </DashboardShell>
  );
}
