import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CertificateRecord = {
  id: string;
  user_id: string;
  course_id: string;
  student_name: string;
  course_title: string;
  instructor_name: string;
  certificate_number: string;
  issued_at: string;
  verification_id: string;
  status: "issued" | "revoked";
  revoked_at: string | null;
  revoked_by: string | null;
  revocation_reason: string | null;
};

type RoleRecord = { role: string };
type DbError = { message: string };
type DbResult<T> = { data: T | null; error: DbError | null };
type IssuedCertificate = {
  id: string;
  certificate_number: string;
  verification_id: string;
  issued_at: string;
  status: "issued";
};
type Query<T> = PromiseLike<DbResult<T[]>> & {
  select(columns: string): Query<T>;
  eq(column: string, value: string): Query<T>;
  order(column: string, options?: { ascending?: boolean }): Query<T>;
};
type CertificateClient = {
  from(table: "certificates"): Query<CertificateRecord>;
  from(table: "user_roles"): Query<RoleRecord>;
  rpc(
    name: "issue_course_certificate",
    args: { _course_id: string },
  ): PromiseLike<DbResult<unknown>>;
  rpc(
    name: "revoke_course_certificate",
    args: { _certificate_id: string; _reason: string },
  ): PromiseLike<{ error: DbError | null }>;
};

async function requireAdmin(supabase: CertificateClient, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (!data?.some((item) => item.role === "admin")) {
    throw new Error("Forbidden: Admin access required.");
  }
}

export const getMyCertificates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as CertificateClient;
    const { data: certificates, error } = await supabase
      .from("certificates")
      .select(
        "id, user_id, course_id, student_name, course_title, instructor_name, certificate_number, issued_at, verification_id, status, revoked_at, revoked_by, revocation_reason",
      )
      .eq("user_id", context.userId)
      .order("issued_at", { ascending: false });
    if (error) throw new Error(error.message);
    return certificates ?? [];
  });

export const issueMyCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ courseId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<IssuedCertificate> => {
    const supabase = context.supabase as unknown as CertificateClient;
    const { data: result, error } = await supabase.rpc("issue_course_certificate", {
      _course_id: data.courseId,
    });
    if (error) throw new Error(error.message);
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("Certificate issuance returned an invalid response.");
    }
    const record = result as Record<string, unknown>;
    if (
      typeof record["id"] !== "string" ||
      typeof record["certificate_number"] !== "string" ||
      typeof record["verification_id"] !== "string" ||
      typeof record["issued_at"] !== "string" ||
      record["status"] !== "issued"
    ) {
      throw new Error("Certificate issuance returned an invalid response.");
    }
    return {
      id: record["id"],
      certificate_number: record["certificate_number"],
      verification_id: record["verification_id"],
      issued_at: record["issued_at"],
      status: "issued",
    };
  });

export type AdminCertificate = CertificateRecord;

export const listAdminCertificates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminCertificate[]> => {
    const supabase = context.supabase as unknown as CertificateClient;
    await requireAdmin(supabase, context.userId);
    const { data: records, error } = await supabase
      .from("certificates")
      .select(
        "id, user_id, course_id, student_name, course_title, instructor_name, certificate_number, issued_at, verification_id, status, revoked_at, revoked_by, revocation_reason",
      )
      .order("issued_at", { ascending: false });
    if (error) throw new Error(error.message);
    return records ?? [];
  });

export const revokeAdminCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        certificateId: z.string().uuid(),
        reason: z.string().trim().min(1).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as unknown as CertificateClient;
    await requireAdmin(supabase, context.userId);
    const { error } = await supabase.rpc("revoke_course_certificate", {
      _certificate_id: data.certificateId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
