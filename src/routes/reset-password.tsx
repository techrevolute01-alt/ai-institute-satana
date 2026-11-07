import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LoaderCircle, CircleCheck } from "lucide-react";
import { AuthPage, AuthCard, PasswordField } from "@/components/skillora/auth-form";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { authMessage } from "@/lib/auth";
export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Choose New Password — AI Institute" },
      { name: "description", content: "Set a new password for your AI Institute account." },
      { property: "og:title", content: "Choose New Password — AI Institute" },
      { property: "og:description", content: "Set a new password for your AI Institute account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    const recovery = new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";
    supabase.auth.getSession().then(({ data }) => setReady(recovery || Boolean(data.session)));
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const p = String(f.get("password") ?? "");
    const c = String(f.get("confirm") ?? "");
    if (p.length < 8 || !/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/[0-9]/.test(p)) {
      setError("Use 8+ characters with uppercase, lowercase, and a number.");
      return;
    }
    if (p !== c) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.updateUser({ password: p });
      if (error) throw error;
      setDone(true);
      toast.success("Password updated successfully.");
    } catch (e) {
      toast.error(authMessage(e));
    } finally {
      setLoading(false);
    }
  }
  if (done)
    return (
      <AuthPage>
        <AuthCard title="Password updated" subtitle="Your new password is now active.">
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <CircleCheck className="size-10 text-success" />
            <p className="text-sm text-muted-foreground">
              You can now sign in with your new password.
            </p>
            <Button asChild>
              <Link to="/login" search={{}}>
                Back to login
              </Link>
            </Button>
          </div>
        </AuthCard>
      </AuthPage>
    );
  return (
    <AuthPage>
      <AuthCard
        title="Choose a new password"
        subtitle={
          ready
            ? "Create a strong password for your account."
            : "Open the password reset link from your email first."
        }
        onSubmit={submit}
      >
        <PasswordField label="New password" name="password" disabled={!ready} error={error} />
        <PasswordField label="Confirm password" name="confirm" disabled={!ready} />
        <Button disabled={!ready || loading}>
          {loading && <LoaderCircle className="animate-spin" />}Update password
        </Button>
      </AuthCard>
    </AuthPage>
  );
}
