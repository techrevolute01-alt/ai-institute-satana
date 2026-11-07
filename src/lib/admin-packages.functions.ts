import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TypedSupabaseClient } from "@/lib/supabase-types";
import {
  hasNonDefaultCommissionSettings,
  isMissingPackageCommissionColumns,
  packageCommissionDefaults,
} from "@/lib/commission-schema";

const commissionTypeSchema = z.enum(["percentage", "fixed"]);

async function assertAdmin(ctx: { supabase: TypedSupabaseClient; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  if (!(data ?? []).some((r: { role: string }) => r.role === "admin"))
    throw new Error("Forbidden: Admin access required");
}

export const packageSchema = z
  .object({
    name: z.string().trim().min(2, "Package name is required").max(120),
    description: z.string().trim().min(1, "Description is required").max(2000),
    thumbnail_url: z
      .string()
      .trim()
      .url("Thumbnail must be a valid URL")
      .max(1000)
      .or(z.literal("")),
    original_price: z.number({ message: "Original price is required" }).min(0).max(10_000_000),
    selling_price: z.number({ message: "Selling price is required" }).min(0).max(10_000_000),
    commission_type: commissionTypeSchema,
    commission_value: z.number().min(0).max(10_000_000),
    validity_days: z.number().int().min(1).max(36500).nullable(),
    status: z.enum(["published", "draft", "archived"]),
    display_order: z.number().int().min(0).max(100000),
  })
  .refine((v) => v.selling_price <= v.original_price, {
    message: "Selling price cannot be greater than original price",
    path: ["selling_price"],
  })
  .refine((v) => v.commission_type !== "percentage" || v.commission_value <= 100, {
    message: "Percentage commission cannot exceed 100%",
    path: ["commission_value"],
  });
export type PackageInput = z.infer<typeof packageSchema>;

export type AdminPackage = PackageInput & { id: string; slug: string; course_count: number };

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "package";

export const listAdminPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminPackage[]> => {
    await assertAdmin(context);
    const primary = await context.supabase
      .from("packages")
      .select(
        "id, slug, name, description, thumbnail_url, original_price, selling_price, commission_type, commission_value, validity_days, status, display_order, package_courses(count)",
      )
      .order("display_order")
      .order("created_at", { ascending: false });
    let rows = primary.data ?? [];
    if (isMissingPackageCommissionColumns(primary.error)) {
      const legacy = await context.supabase
        .from("packages")
        .select(
          "id, slug, name, description, thumbnail_url, original_price, selling_price, validity_days, status, display_order, package_courses(count)",
        )
        .order("display_order")
        .order("created_at", { ascending: false });
      if (legacy.error) throw new Error(legacy.error.message);
      rows = (legacy.data ?? []).map((p) => ({
        ...p,
        commission_type: "percentage" as const,
        commission_value: 0,
      }));
    } else if (primary.error) {
      throw new Error(primary.error.message);
    }

    return rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      thumbnail_url: p.thumbnail_url ?? "",
      original_price: Number(p.original_price),
      selling_price: Number(p.selling_price),
      ...packageCommissionDefaults(p),
      validity_days: p.validity_days,
      status: p.status,
      display_order: p.display_order,
      course_count: p.package_courses?.[0]?.count ?? 0,
    }));
  });

export const savePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid().optional(), values: packageSchema }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const row = { ...data.values, thumbnail_url: data.values.thumbnail_url || null };
    const slug = `${slugify(row.name)}-${crypto.randomUUID().slice(0, 6)}`;
    const write = (
      values: Omit<typeof row, "commission_type" | "commission_value"> &
        Partial<Pick<typeof row, "commission_type" | "commission_value">>,
    ) =>
      data.id
        ? context.supabase.from("packages").update(values).eq("id", data.id)
        : context.supabase.from("packages").insert({ ...values, slug });
    const primary = await write(row);
    if (isMissingPackageCommissionColumns(primary.error)) {
      if (
        hasNonDefaultCommissionSettings(data.values.commission_type, data.values.commission_value)
      ) {
        throw new Error(
          "Package commission settings cannot be saved until the approved Supabase commission migration is applied.",
        );
      }
      const {
        commission_type: _commissionType,
        commission_value: _commissionValue,
        ...legacyRow
      } = row;
      const legacy = await write(legacyRow);
      if (legacy.error) throw new Error(legacy.error.message);
    } else if (primary.error) {
      throw new Error(primary.error.message);
    }
    return { ok: true };
  });

export const setPackageStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("packages")
      .update({ status: data.active ? "published" : "draft" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("packages").delete().eq("id", data.id);
    if (error)
      throw new Error(
        error.code === "23503"
          ? "This package has orders or linked records and cannot be deleted. Deactivate it instead."
          : error.message,
      );
    return { ok: true };
  });
