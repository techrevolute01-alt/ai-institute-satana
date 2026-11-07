import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/skillora/workspace-page";
import { requireRole } from "@/lib/auth";
export const Route = createFileRoute("/_authenticated/admin/settings")({
  beforeLoad: ({ location }) => requireRole("admin", location.href),
  head: () => ({
    meta: [
      { title: "Settings — AI Institute" },
      { name: "description", content: "Manage AI Institute platform settings." },
      { property: "og:title", content: "Settings — AI Institute" },
      { property: "og:description", content: "Manage AI Institute platform settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <WorkspacePage
      mode="admin"
      eyebrow="Settings"
      title="Platform settings"
      description="Manage AI Institute platform settings."
    />
  ),
});
