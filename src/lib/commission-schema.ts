import type { AffiliateCommissionType } from "@/lib/affiliate-commission";

type SchemaError = { code?: string; message?: string } | null;

export function isMissingPackageCommissionColumns(error: SchemaError) {
  if (!error) return false;
  const mentionsCommissionColumn = /commission_(?:type|value)/i.test(error.message ?? "");
  const missingColumn =
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column|schema cache|could not find|does not exist/i.test(error.message ?? "");
  return mentionsCommissionColumn && missingColumn;
}

export function packageCommissionDefaults(row?: {
  commission_type?: AffiliateCommissionType | null;
  commission_value?: number | string | null;
}) {
  return {
    commission_type: row?.commission_type ?? "percentage",
    commission_value: Number(row?.commission_value ?? 0),
  } as const;
}

export function hasNonDefaultCommissionSettings(
  commissionType: AffiliateCommissionType,
  commissionValue: number,
) {
  return commissionType !== "percentage" || commissionValue !== 0;
}
