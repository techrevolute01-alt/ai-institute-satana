import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches all public information pages instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    for (const path of [
      "/",
      "/courses",
      "/courses/example-course",
      "/packages",
      "/packages/example-package",
      "/checkout/example-package",
      "/checkout/demo/123e4567-e89b-12d3-a456-426614174000",
      "/about",
      "/contact",
      "/privacy-policy",
      "/refund-policy",
      "/return-policy",
      "/disclaimer",
    ]) {
      const matches = router.matchRoutes(path);
      expect(matches.at(-1)?.routeId, `Expected ${path} to resolve`).not.toBe(rootRouteId);
    }
  });
});
