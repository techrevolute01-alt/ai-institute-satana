import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { LoaderCircle } from "lucide-react";
import { AuthCard, AuthPage, Field, PasswordField } from "@/components/skillora/auth-form";
import { Button } from "@/components/ui/button";
import { authMessage, getAuthSnapshot, roleHome } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});
export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const r = search["redirect"];
    return typeof r === "string" && r.startsWith("/") && !r.startsWith("//") ? { redirect: r } : {};
  },
  head: () => ({
    meta: [
      { title: "Login — AI Institute" },
      { name: "description", content: "Sign in to continue your AI Institute learning journey." },
      { property: "og:title", content: "Login — AI Institute" },
      {
        property: "og:description",
        content: "Sign in to continue your AI Institute learning journey.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});
function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const result = schema.safeParse({ email: fd.get("email"), password: fd.get("password") });
    if (!result.success) {
      setErrors(Object.fromEntries(result.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword(result.data);
      if (error) throw error;
      const auth = await getAuthSnapshot();
      toast.success("Welcome back to AI Institute.");
      const destination = search["redirect"] ?? roleHome(auth?.roles ?? ["student"]);
      await navigate({ to: destination });
    } catch (error) {
      toast.error(authMessage(error));
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthPage>
      <AuthCard title="Welcome back" subtitle="Continue where you left off." onSubmit={submit}>
        <Field
          name="email"
          type="email"
          autoComplete="email"
          label="Email"
          placeholder="you@example.com"
          error={errors["email"]}
        />
        <PasswordField
          name="password"
          autoComplete="current-password"
          label="Password"
          placeholder="Your password"
          error={errors["password"]}
        />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-semibold text-brand">
            Forgot password?
          </Link>
        </div>
        <Button disabled={loading}>
          {loading && <LoaderCircle className="animate-spin" />}
          {loading ? "Signing in…" : "Login"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          New to AI Institute?{" "}
          <Link
            to="/register"
            search={search.redirect ? { redirect: search.redirect } : {}}
            className="font-semibold text-brand"
          >
            Create account
          </Link>
        </p>
      </AuthCard>
    </AuthPage>
  );
}
