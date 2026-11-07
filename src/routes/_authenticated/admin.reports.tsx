import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/skillora/workspace-page";
import { requireRole } from "@/lib/auth";
export const Route = createFileRoute("/_authenticated/admin/reports")({
  beforeLoad: ({ location }) => requireRole("admin", location.href),
  head: () => ({
    meta: [
      { title: "Reports — AI Institute" },
      { name: "description", content: "Analytics and reports will appear here." },
      { property: "og:title", content: "Reports — AI Institute" },
      { property: "og:description", content: "Analytics and reports will appear here." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <WorkspacePage
      mode="admin"
      eyebrow="Reports"
      title="Reporting"
      description="Analytics and reports will appear here."
    />
  ),
});
