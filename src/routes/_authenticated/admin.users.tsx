import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { requireRole } from "@/lib/auth";
import { listUsersWithRoles, setAdminRole } from "@/lib/admin-users.functions";
import { DashboardShell } from "@/components/skillora/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin/users")({
  beforeLoad: ({ location }) => requireRole("admin", location.href),
  head: () => ({
    meta: [
      { title: "Users & Roles — AI Institute" },
      {
        name: "description",
        content: "Assign or remove the Admin role for registered AI Institute users.",
      },
      { property: "og:title", content: "Users & Roles — AI Institute" },
      {
        property: "og:description",
        content: "Assign or remove the Admin role for registered AI Institute users.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const list = useServerFn(listUsersWithRoles);
  const setRole = useServerFn(setAdminRole);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data, isPending, error } = useQuery({ queryKey: ["admin-users"], queryFn: () => list() });
  const m = useMutation({
    mutationFn: (v: { userId: string; grant: boolean }) => setRole({ data: v }),
    onSuccess: (_, v) => {
      toast.success(v.grant ? "Admin role assigned." : "Admin role removed.");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update role."),
  });
  const rows = (data ?? []).filter((u) =>
    `${u.full_name} ${u.email ?? ""}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <DashboardShell mode="admin">
      <p className="text-xs font-semibold uppercase text-accent">Users & Roles</p>
      <h1 className="mt-2 font-display text-4xl font-bold">Admin access</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Assign or remove the Admin role for existing registered users. Only Admins can make these
        changes.
      </p>
      <section className="mt-8 rounded-lg bg-surface p-6 border border-line">
        <Input
          placeholder="Search by name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        {isPending ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading users…</p>
        ) : error ? (
          <p className="mt-4 text-sm text-destructive">Could not load users.</p>
        ) : rows.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No users found.</p>
        ) : (
          <ul className="mt-4 divide-y divide-ink/10">
            {rows.map((u) => {
              const isAdmin = u.roles.includes("admin");
              return (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{u.full_name || "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {u.email ?? "No email"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {u.roles.map((r) => (
                      <span
                        key={r}
                        className="rounded-full bg-background px-2.5 py-0.5 text-xs font-semibold uppercase ring-1 ring-ink/20"
                      >
                        {r}
                      </span>
                    ))}
                    <Button
                      size="sm"
                      variant={isAdmin ? "outline" : "default"}
                      disabled={m.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            isAdmin
                              ? `Remove Admin role from ${u.email}?`
                              : `Make ${u.email} an Admin?`,
                          )
                        )
                          m.mutate({ userId: u.id, grant: !isAdmin });
                      }}
                    >
                      {isAdmin ? "Remove Admin" : "Make Admin"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}
