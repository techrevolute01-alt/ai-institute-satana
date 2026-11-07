import { describe, expect, it } from "vitest";
import {
  hasNonDefaultCommissionSettings,
  isMissingPackageCommissionColumns,
  packageCommissionDefaults,
} from "@/lib/commission-schema";

describe("commission schema compatibility", () => {
  it("recognizes missing commission columns without hiding unrelated database errors", () => {
    expect(
      isMissingPackageCommissionColumns({
        code: "42703",
        message: "column packages.commission_type does not exist",
      }),
    ).toBe(true);
    expect(
      isMissingPackageCommissionColumns({
        code: "PGRST204",
        message: "Could not find the commission_value column in the schema cache",
      }),
    ).toBe(true);
    expect(
      isMissingPackageCommissionColumns({
        code: "42501",
        message: "permission denied for table packages",
      }),
    ).toBe(false);
  });

  it("uses safe zero-percentage defaults for packages without commission columns", () => {
    expect(packageCommissionDefaults()).toEqual({
      commission_type: "percentage",
      commission_value: 0,
    });
    expect(
      packageCommissionDefaults({ commission_type: "fixed", commission_value: "300.00" }),
    ).toEqual({ commission_type: "fixed", commission_value: 300 });
  });

  it("requires the migration before saving a non-default commission setting", () => {
    expect(hasNonDefaultCommissionSettings("percentage", 0)).toBe(false);
    expect(hasNonDefaultCommissionSettings("percentage", 10)).toBe(true);
    expect(hasNonDefaultCommissionSettings("fixed", 0)).toBe(true);
  });
});
