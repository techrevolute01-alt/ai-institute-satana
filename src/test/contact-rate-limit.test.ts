import { describe, expect, it } from "vitest";
import { checkContactSubmissionLimit } from "@/lib/contact-rate-limit.server";

describe("Contact submission rate limit", () => {
  it("allows up to five submissions per client in a fifteen-minute window", () => {
    const client = `contact-test-${crypto.randomUUID()}`;
    const now = 1_800_000_000_000;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(checkContactSubmissionLimit(client, now + attempt).allowed).toBe(true);
    }

    const limited = checkContactSubmissionLimit(client, now + 5);
    expect(limited.allowed).toBe(false);
    if (!limited.allowed) expect(limited.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("allows another submission after the rate-limit window expires", () => {
    const client = `contact-test-${crypto.randomUUID()}`;
    const now = 1_800_000_000_000;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      checkContactSubmissionLimit(client, now + attempt);
    }

    expect(checkContactSubmissionLimit(client, now + 15 * 60 * 1000 + 1).allowed).toBe(true);
  });
});
