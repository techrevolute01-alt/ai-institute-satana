import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { LoaderCircle } from "lucide-react";
import { z } from "zod";
import { AuthPage, AuthCard, Field } from "@/components/skillora/auth-form";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { authMessage } from "@/lib/auth";
export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot Password — AI Institute" },
      { name: "description", content: "Request a secure AI Institute password reset link." },
      { property: "og:title", content: "Forgot Password — AI Institute" },
      { property: "og:description", content: "Request a secure AI Institute password reset link." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    const parsed = z.string().email().safeParse(email);
    if (!parsed.success) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("If an account exists, a reset link is on its way.");
    } catch (e) {
      toast.error(authMessage(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthPage>
      <AuthCard
        title="Reset your password"
        subtitle="We’ll send a secure reset link to your email."
        onSubmit={submit}
      >
        <Field label="Email" name="email" type="email" autoComplete="email" error={error} />
        <Button disabled={loading}>
          {loading && <LoaderCircle className="animate-spin" />}Send reset link
        </Button>
        <Link to="/login" search={{}} className="text-center text-sm font-semibold text-brand">
          Back to login
        </Link>
      </AuthCard>
    </AuthPage>
  );
}
