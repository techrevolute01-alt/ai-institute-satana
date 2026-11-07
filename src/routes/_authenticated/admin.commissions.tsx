import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { requireRole } from "@/lib/auth";
import { listCommissions, reviewCommission, type CommissionRow } from "@/lib/admin-ops.functions";
import { DashboardShell } from "@/components/skillora/dashboard";
import {
  DataTable,
  PageHeader,
  StatusPill,
  date,
  money,
  pageHead,
} from "@/components/skillora/data-table";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/commissions")({
  beforeLoad: ({ location }) => requireRole("admin", location.href),
  head: pageHead("Commissions", "Review affiliate commission records."),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const list = useServerFn(listCommissions);
  const review = useServerFn(reviewCommission);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-commissions"],
    queryFn: () => list(),
  });
  const approval = useMutation({
    mutationFn: review,
    onSuccess: () => {
      toast.success("Commission approved.");
      qc.invalidateQueries({ queryKey: ["admin-commissions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not approve commission."),
  });
  return (
    <DashboardShell mode="admin">
      <PageHeader
        eyebrow="Commissions"
        title="Commission records"
        description="Review commissions from real, verified payments. Demo transactions never generate commissions."
      />
      <DataTable<CommissionRow>
        rows={data}
        loading={isPending}
        error={error}
        empty="No commission records yet."
        rowKey={(r) => r.id}
        columns={[
          { label: "Affiliate", cell: (r) => <span className="font-semibold">{r.affiliate}</span> },
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
          {
            label: "Actions",
            align: "right",
            cell: (r) =>
              r.status === "pending" ? (
                <Button
                  size="sm"
                  disabled={approval.isPending}
                  onClick={() => approval.mutate({ data: { id: r.id } })}
                >
                  Approve
                </Button>
              ) : (
                "—"
              ),
          },
        ]}
      />
    </DashboardShell>
  );
}
