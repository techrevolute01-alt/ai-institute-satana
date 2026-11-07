import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/skillora/layout";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/unauthorized")({
  head: () => ({
    meta: [
      { title: "Access Restricted — AI Institute" },
      { name: "description", content: "This AI Institute area requires another account role." },
      { property: "og:title", content: "Access Restricted — AI Institute" },
      { property: "og:description", content: "This AI Institute area requires another account role." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <PublicLayout>
      <main className="grid min-h-[70vh] place-items-center px-5">
        <div className="max-w-lg text-center">
          <p className="text-xs font-semibold uppercase text-accent">Access restricted</p>
          <h1 className="mt-3 font-display text-4xl font-bold">
            This workspace is not active for your account.
          </h1>
          <p className="mt-4 text-muted-foreground">
            Return to your dashboard or contact an administrator if you think this is a mistake.
          </p>
          <Button asChild className="mt-7">
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </main>
    </PublicLayout>
  ),
});
