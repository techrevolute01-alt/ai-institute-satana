import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/skillora/workspace-page";
import { requireRole } from "@/lib/auth";
export const Route = createFileRoute("/_authenticated/my-packages")({
  beforeLoad: ({ location }) => requireRole("student", location.href),
  head: () => ({
    meta: [
      { title: "My Packages — AI Institute" },
      { name: "description", content: "Access the packages connected to your account." },
      { property: "og:title", content: "My Packages — AI Institute" },
      { property: "og:description", content: "Access the packages connected to your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <WorkspacePage
      mode="student"
      eyebrow="My Packages"
      title="Learning packages"
      description="Access the packages connected to your account."
    />
  ),
});
