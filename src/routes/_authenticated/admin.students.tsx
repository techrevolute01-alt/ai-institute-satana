import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { requireRole } from "@/lib/auth";
import { listStudents, setStudentStatus, type StudentRow } from "@/lib/admin-ops.functions";
import { DashboardShell } from "@/components/skillora/dashboard";
import {
  DataTable,
  PageHeader,
  StatusPill,
  date,
  pageHead,
} from "@/components/skillora/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin/students")({
  beforeLoad: ({ location }) => requireRole("admin", location.href),
  head: pageHead("Students", "Manage AI Institute student accounts."),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const list = useServerFn(listStudents);
  const setStatus = useServerFn(setStudentStatus);
  const [q, setQ] = useState("");
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-students"],
    queryFn: () => list(),
  });
  const m = useMutation({
    mutationFn: setStatus,
    onSuccess: () => {
      toast.success("Account status updated.");
      qc.invalidateQueries({ queryKey: ["admin-students"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update."),
  });
  const rows = data?.filter((s) =>
    `${s.full_name} ${s.email} ${s.mobile}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <DashboardShell mode="admin">
      <PageHeader
        eyebrow="Students"
        title="Student management"
        description="View registered learners and activate or suspend accounts."
        action={
          <Input
            className="w-64"
            placeholder="Search name, email, mobile"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        }
      />
      <DataTable<StudentRow>
        rows={rows}
        loading={isPending}
        error={error}
        empty="No students found."
        rowKey={(r) => r.id}
        columns={[
          {
            label: "Name",
            cell: (r) => <span className="font-semibold">{r.full_name || "—"}</span>,
          },
          { label: "Email", cell: (r) => r.email ?? "—" },
          { label: "Mobile", cell: (r) => r.mobile ?? "—" },
          { label: "Joined", cell: (r) => date(r.created_at) },
          { label: "Status", cell: (r) => <StatusPill value={r.account_status} /> },
          {
            label: "Actions",
            align: "right",
            cell: (r) => (
              <Button
                size="sm"
                variant="outline"
                disabled={m.isPending}
                onClick={() =>
                  m.mutate({
                    data: {
                      userId: r.id,
                      status: r.account_status === "suspended" ? "active" : "suspended",
                    },
                  })
                }
              >
                {r.account_status === "suspended" ? "Activate" : "Suspend"}
              </Button>
            ),
          },
        ]}
      />
    </DashboardShell>
  );
}
