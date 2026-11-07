import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { requireRole } from "@/lib/auth";
import { listAffiliates, reviewAffiliate, type AffiliateRow } from "@/lib/admin-ops.functions";
import { DashboardShell } from "@/components/skillora/dashboard";
import {
  DataTable,
  PageHeader,
  StatusPill,
  date,
  pageHead,
} from "@/components/skillora/data-table";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/affiliates")({
  beforeLoad: ({ location }) => requireRole("admin", location.href),
  head: pageHead("Affiliates", "Review and manage affiliate accounts."),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const list = useServerFn(listAffiliates);
  const review = useServerFn(reviewAffiliate);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-affiliates"],
    queryFn: () => list(),
  });
  const m = useMutation({
    mutationFn: (v: { data: { id: string; approve: boolean } }) => review(v),
    onSuccess: (_, v) => {
      toast.success(v.data.approve ? "Affiliate approved." : "Affiliate rejected.");
      qc.invalidateQueries({ queryKey: ["admin-affiliates"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update."),
  });
  return (
    <DashboardShell mode="admin">
      <PageHeader
        eyebrow="Affiliates"
        title="Affiliate management"
        description="Approve affiliate requests. Approval grants Affiliate Mode on the same account and creates a referral code."
      />
      <DataTable<AffiliateRow>
        rows={data}
        loading={isPending}
        error={error}
        empty="No affiliate requests yet."
        rowKey={(r) => r.id}
        columns={[
          { label: "Name", cell: (r) => <span className="font-semibold">{r.full_name}</span> },
          { label: "Email", cell: (r) => r.email ?? "—" },
          { label: "Referral code", cell: (r) => r.referral_code ?? "—" },
          { label: "Requested", cell: (r) => date(r.created_at) },
          { label: "Status", cell: (r) => <StatusPill value={r.status} /> },
          {
            label: "Actions",
            align: "right",
            cell: (r) => (
              <div className="flex justify-end gap-2">
                {r.status !== "approved" && (
                  <Button
                    size="sm"
                    disabled={m.isPending}
                    onClick={() => m.mutate({ data: { id: r.id, approve: true } })}
                  >
                    Approve
                  </Button>
                )}
                {r.status !== "rejected" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={m.isPending}
                    onClick={() => {
                      if (confirm("Reject / deactivate this affiliate?"))
                        m.mutate({ data: { id: r.id, approve: false } });
                    }}
                  >
                    {r.status === "approved" ? "Deactivate" : "Reject"}
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />
    </DashboardShell>
  );
}
