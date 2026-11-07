import { afterEach, describe, expect, it, vi } from "vitest";
import { isDemoPaymentEnabled } from "@/lib/demo-payment.server";

describe("demo payment environment gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled unless explicitly enabled for a matching development project", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEMO_PAYMENTS_ENABLED", "true");
    vi.stubEnv("SUPABASE_URL", "https://test-project.supabase.co");
    vi.stubEnv("DEMO_SUPABASE_PROJECT_ID", "test-project");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-placeholder");
    expect(isDemoPaymentEnabled()).toBe(true);

    vi.stubEnv("DEMO_SUPABASE_PROJECT_ID", "different-project");
    expect(isDemoPaymentEnabled()).toBe(false);
  });

  it("never enables demo payment in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_PAYMENTS_ENABLED", "true");
    vi.stubEnv("SUPABASE_URL", "https://test-project.supabase.co");
    vi.stubEnv("DEMO_SUPABASE_PROJECT_ID", "test-project");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-placeholder");
    expect(isDemoPaymentEnabled()).toBe(false);
  });
});
