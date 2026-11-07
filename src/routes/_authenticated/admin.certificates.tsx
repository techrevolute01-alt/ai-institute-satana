import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/skillora/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireRole } from "@/lib/auth";
import { listAdminCertificates, revokeAdminCertificate } from "@/lib/certificate.functions";

export const Route = createFileRoute("/_authenticated/admin/certificates")({
  beforeLoad: ({ location }) => requireRole("admin", location.href),
  head: () => ({
    meta: [
      { title: "Certificates — AI Institute Admin" },
      { name: "description", content: "Review and manage issued course certificates." },
    ],
  }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const list = useServerFn(listAdminCertificates);
  const revoke = useServerFn(revokeAdminCertificate);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-certificates"],
    queryFn: () => list(),
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [throughDate, setThroughDate] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const revokeMutation = useMutation({
    mutationFn: (input: { certificateId: string; reason: string }) => revoke({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-certificates"] });
      toast.success("Certificate revoked.");
    },
    onError: (cause) =>
      toast.error(cause instanceof Error ? cause.message : "Could not revoke certificate."),
  });
  const filtered = useMemo(
    () =>
      (data ?? []).filter((certificate) => {
        const text = [
          certificate.student_name,
          certificate.course_title,
          certificate.certificate_number,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const issuedDate = certificate.issued_at.slice(0, 10);
        return (
          text.includes(search.trim().toLowerCase()) &&
          (status === "all" || certificate.status === status) &&
          (!fromDate || issuedDate >= fromDate) &&
          (!throughDate || issuedDate <= throughDate)
        );
      }),
    [data, search, status, fromDate, throughDate],
  );

  return (
    <DashboardShell mode="admin">
      <p className="text-xs font-semibold uppercase text-accent">Learning operations</p>
      <h1 className="mt-2 font-display text-4xl font-bold">Certificate management</h1>
      <p className="mt-2 text-muted-foreground">
        Review issued certificates and record revocations with a reason.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search student, course, or certificate number"
            aria-label="Search certificates"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Status
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="issued">Issued</option>
            <option value="revoked">Revoked</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs font-medium">
            Issued from
            <Input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Through
            <Input
              type="date"
              value={throughDate}
              onChange={(event) => setThroughDate(event.target.value)}
            />
          </label>
        </div>
      </div>

      <section className="mt-6 grid gap-4">
        {isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading certificates…
          </p>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        ) : filtered.length ? (
          filtered.map((certificate) => (
            <article
              key={certificate.id}
              className="grid gap-4 rounded-lg bg-surface p-5 ring-1 ring-ink/15 lg:grid-cols-[1fr_auto]"
            >
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-xl font-semibold">{certificate.course_title}</h2>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${certificate.status === "issued" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}
                  >
                    {certificate.status}
                  </span>
                </div>
                <p className="text-sm">
                  Student: <span className="font-semibold">{certificate.student_name}</span>
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {certificate.certificate_number}
                </p>
                <p className="text-xs text-muted-foreground">
                  Issued {new Date(certificate.issued_at).toLocaleString()}
                  {certificate.revoked_at &&
                    ` · Revoked ${new Date(certificate.revoked_at).toLocaleString()}`}
                </p>
                {certificate.revocation_reason && (
                  <p className="text-sm text-destructive">
                    Revocation reason: {certificate.revocation_reason}
                  </p>
                )}
                <Link
                  to="/verify-certificate/$verificationId"
                  params={{ verificationId: certificate.verification_id }}
                  search={{}}
                  className="w-fit text-sm font-semibold text-accent hover:underline"
                >
                  View certificate and verification
                </Link>
              </div>
              {certificate.status === "issued" && (
                <div className="grid content-start gap-2 lg:w-72">
                  <label className="grid gap-1 text-xs font-medium">
                    Revocation reason
                    <Input
                      value={reasons[certificate.id] ?? ""}
                      maxLength={1000}
                      onChange={(event) =>
                        setReasons({ ...reasons, [certificate.id]: event.target.value })
                      }
                      placeholder="Required reason"
                    />
                  </label>
                  <Button
                    variant="destructive"
                    disabled={revokeMutation.isPending || !(reasons[certificate.id] ?? "").trim()}
                    onClick={() => {
                      const reason = (reasons[certificate.id] ?? "").trim();
                      if (
                        reason &&
                        window.confirm(
                          "Revoke this certificate? It will be shown as revoked on its verification page.",
                        )
                      ) {
                        revokeMutation.mutate({ certificateId: certificate.id, reason });
                      }
                    }}
                  >
                    {revokeMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                    Revoke certificate
                  </Button>
                </div>
              )}
            </article>
          ))
        ) : (
          <div className="rounded-lg bg-surface p-6 ring-1 ring-ink/15">
            <h2 className="font-semibold">
              {data?.length ? "No matching certificates" : "No certificates have been issued"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {data?.length
                ? "Adjust the search or filters to see other certificates."
                : "Issued course certificates will appear here."}
            </p>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
