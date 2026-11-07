import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Award, Check, Copy, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

type Verification = {
  status: "issued" | "revoked" | "not_found";
  certificate_number?: string;
  student_name?: string;
  course_title?: string;
  instructor_name?: string;
  issued_at?: string;
  revoked_at?: string | null;
};

function parseVerification(value: Json): Verification {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The verification service returned an invalid response.");
  }
  const status = value["status"];
  if (status !== "issued" && status !== "revoked" && status !== "not_found") {
    throw new Error("The verification service returned an unknown certificate status.");
  }
  return {
    status,
    ...(typeof value["certificate_number"] === "string"
      ? { certificate_number: value["certificate_number"] }
      : {}),
    ...(typeof value["student_name"] === "string" ? { student_name: value["student_name"] } : {}),
    ...(typeof value["course_title"] === "string" ? { course_title: value["course_title"] } : {}),
    ...(typeof value["instructor_name"] === "string"
      ? { instructor_name: value["instructor_name"] }
      : {}),
    ...(typeof value["issued_at"] === "string" ? { issued_at: value["issued_at"] } : {}),
    revoked_at: typeof value["revoked_at"] === "string" ? value["revoked_at"] : null,
  };
}

export const Route = createFileRoute("/verify-certificate/$verificationId")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...(search["print"] === "true" ? { print: "true" as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Certificate Verification — AI Institute" },
      { name: "description", content: "Verify a AI Institute course completion certificate." },
    ],
  }),
  component: Page,
});

function Page() {
  const { verificationId } = Route.useParams();
  const { print } = Route.useSearch();
  const verification = useQuery({
    queryKey: ["certificate-verification", verificationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("verify_course_certificate", {
        _verification_id: verificationId,
      });
      if (error) throw new Error(error.message);
      return parseVerification(data);
    },
    retry: false,
  });

  useEffect(() => {
    if (print === "true" && verification.data?.status === "issued") {
      window.setTimeout(() => window.print(), 150);
    }
  }, [print, verification.data]);

  async function copyVerificationLink() {
    try {
      await navigator.clipboard.writeText(window.location.href.split("?")[0]!);
      toast.success("Verification link copied.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not copy the verification link.");
    }
  }

  const certificate = verification.data;
  const isIssued = certificate?.status === "issued";
  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-ink sm:px-8">
      <style>{`
        @page { size: A4 landscape; margin: 0; }
        @media print {
          body { background: #fff !important; }
          .certificate-controls { display: none !important; }
          .certificate-page { min-height: 0 !important; padding: 0 !important; }
          .certificate-sheet {
            width: 297mm !important;
            height: 210mm !important;
            max-width: none !important;
            aspect-ratio: auto !important;
            border: 0 !important;
            box-shadow: none !important;
            page-break-after: avoid;
          }
        }
      `}</style>
      <div className="certificate-page mx-auto max-w-5xl">
        <header className="certificate-controls mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-accent">Learn. Grow. Earn.</p>
            <h1 className="mt-1 font-display text-2xl font-bold">Certificate verification</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/certificates">My certificates</Link>
            </Button>
            {isIssued && (
              <>
                <Button variant="outline" onClick={copyVerificationLink}>
                  <Copy className="size-4" />
                  Copy verification link
                </Button>
                <Button onClick={() => window.print()}>
                  <Printer className="size-4" />
                  Print / Save as PDF
                </Button>
              </>
            )}
          </div>
        </header>

        {verification.isPending ? (
          <div className="rounded-lg bg-surface p-8 text-center text-sm text-muted-foreground">
            Checking certificate…
          </div>
        ) : verification.error ? (
          <div role="alert" className="rounded-lg bg-surface p-8 text-center text-destructive">
            {verification.error.message}
          </div>
        ) : certificate?.status === "not_found" ? (
          <div className="rounded-lg bg-surface p-8 text-center ring-1 ring-ink/10">
            <h2 className="font-display text-2xl font-bold">Certificate not found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This verification link is invalid or the certificate is unavailable.
            </p>
          </div>
        ) : certificate ? (
          <>
            <div
              className={`certificate-controls mb-4 flex items-center gap-2 rounded-md px-4 py-3 text-sm font-semibold ${isIssued ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}
              role="status"
            >
              {isIssued ? <Check className="size-4" /> : <Award className="size-4" />}
              {isIssued
                ? "Valid certificate"
                : `Revoked certificate${certificate.revoked_at ? ` · ${new Date(certificate.revoked_at).toLocaleDateString()}` : ""}`}
            </div>
            <article className="certificate-sheet relative mx-auto grid aspect-[297/210] w-full max-w-5xl place-items-center overflow-hidden border border-[#bfdbfe] bg-white p-[5%] text-center">
              <div className="absolute inset-[2.5%] border border-[#2563eb]" />
              <div className="absolute inset-[3.5%] border border-[#dbeafe]" />
              <div className="relative grid justify-items-center">
                <div className="mb-3 flex items-center gap-2">
                  <span className="size-5 rounded-[3px] bg-accent border border-line" />
                  <span className="font-display text-2xl font-bold">AI Institute</span>
                </div>
                <p className="text-[clamp(10px,1vw,16px)] font-semibold uppercase tracking-[0.3em] text-[#1d4ed8]">
                  Learn. Grow. Earn.
                </p>
                <h2 className="mt-5 font-display text-[clamp(25px,4vw,54px)] font-bold text-[#1e293b]">
                  Certificate of Completion
                </h2>
                <p className="mt-4 text-[clamp(11px,1.4vw,20px)] text-[#64748b]">
                  This certificate is proudly presented to
                </p>
                <p className="mt-3 border-b border-[#93c5fd] px-8 pb-2 font-display text-[clamp(22px,3vw,42px)] font-semibold text-[#1d4ed8]">
                  {certificate.student_name || "Learner"}
                </p>
                <p className="mt-4 text-[clamp(11px,1.4vw,20px)] text-[#64748b]">
                  for successfully completing
                </p>
                <p className="mt-2 font-display text-[clamp(18px,2.4vw,34px)] font-semibold text-[#1e293b]">
                  {certificate.course_title ?? "Course"}
                </p>
                {certificate.instructor_name && (
                  <p className="mt-2 text-[clamp(10px,1vw,14px)] text-[#64748b]">
                    Instructor: {certificate.instructor_name}
                  </p>
                )}
                <div className="mt-5 flex flex-wrap justify-center gap-x-10 gap-y-2 text-[clamp(9px,1vw,14px)] text-[#64748b]">
                  <span>
                    Issued{" "}
                    {certificate.issued_at
                      ? new Date(certificate.issued_at).toLocaleDateString()
                      : ""}
                  </span>
                  {certificate.certificate_number && (
                    <span>Certificate No. {certificate.certificate_number}</span>
                  )}
                </div>
                {certificate.status === "revoked" && (
                  <p className="mt-4 border-2 border-destructive px-5 py-2 text-lg font-bold uppercase tracking-widest text-destructive">
                    Revoked
                  </p>
                )}
                <p className="mt-4 text-[clamp(8px,0.8vw,12px)] text-[#1d4ed8]">
                  Verification link: /verify-certificate/{verificationId}
                </p>
              </div>
            </article>
          </>
        ) : null}
      </div>
    </main>
  );
}
