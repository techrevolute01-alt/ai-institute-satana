import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/skillora/workspace-page";
import { requireRole } from "@/lib/auth";
export const Route = createFileRoute("/_authenticated/notifications")({
  beforeLoad: ({ location }) => requireRole("student", location.href),
  head: () => ({
    meta: [
      { title: "Notifications — AI Institute" },
      { name: "description", content: "Stay current with learning and account updates." },
      { property: "og:title", content: "Notifications — AI Institute" },
      { property: "og:description", content: "Stay current with learning and account updates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <WorkspacePage
      mode="student"
      eyebrow="Notifications"
      title="Your notifications"
      description="Stay current with learning and account updates."
    />
  ),
});
