import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { requireRole } from "@/lib/auth";
import { listPayouts, reviewPayout, type PayoutRow } from "@/lib/admin-ops.functions";
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

export const Route = createFileRoute("/_authenticated/admin/withdrawals")({
  beforeLoad: ({ location }) => requireRole("admin", location.href),
  head: pageHead("Withdrawals", "Review affiliate withdrawal requests."),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const list = useServerFn(listPayouts);
  const review = useServerFn(reviewPayout);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: () => list(),
  });
  const m = useMutation({
    mutationFn: (v: { data: { id: string; approve: boolean } }) => review(v),
    onSuccess: (_, v) => {
      toast.success(v.data.approve ? "Withdrawal marked as paid." : "Withdrawal rejected.");
      qc.invalidateQueries({ queryKey: ["admin-payouts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update."),
  });
  return (
    <DashboardShell mode="admin">
      <PageHeader
        eyebrow="Withdrawals"
        title="Withdrawal requests"
        description="Approve after sending the payout outside AI Institute. Approving deducts the amount from the affiliate's wallet."
      />
      <DataTable<PayoutRow>
        rows={data}
        loading={isPending}
        error={error}
        empty="No withdrawal requests yet."
        rowKey={(r) => r.id}
        columns={[
          { label: "Affiliate", cell: (r) => <span className="font-semibold">{r.affiliate}</span> },
          { label: "Amount", cell: (r) => money(r.amount) },
          { label: "Requested", cell: (r) => date(r.requested_at) },
          { label: "Processed", cell: (r) => date(r.processed_at) },
          { label: "Status", cell: (r) => <StatusPill value={r.status} /> },
          {
            label: "Actions",
            align: "right",
            cell: (r) =>
              r.status === "pending" ? (
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    disabled={m.isPending}
                    onClick={() => {
                      if (confirm(`Mark ${money(r.amount)} as paid?`))
                        m.mutate({ data: { id: r.id, approve: true } });
                    }}
                  >
                    Mark paid
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={m.isPending}
                    onClick={() => m.mutate({ data: { id: r.id, approve: false } })}
                  >
                    Reject
                  </Button>
                </div>
              ) : (
                "—"
              ),
          },
        ]}
      />
    </DashboardShell>
  );
}
