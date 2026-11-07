import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { LoaderCircle, UserRound } from "lucide-react";
import { DashboardShell } from "@/components/skillora/dashboard";
import { Field } from "@/components/skillora/auth-form";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const meta = "Update your AI Institute name, mobile number, and profile image.";
export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — AI Institute" },
      { name: "description", content: meta },
      { property: "og:title", content: "Profile — AI Institute" },
      { property: "og:description", content: meta },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name.").max(100),
  mobile: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+\d\s-]*$/, "Enter a valid mobile number."),
});

function ProfilePage() {
  const { user, roles } = Route.useRouteContext();
  const mode =
    roles.includes("student") || !roles.includes("affiliate")
      ? roles.includes("admin") && !roles.includes("student")
        ? "admin"
        : "student"
      : "affiliate";
  const [profile, setProfile] = useState({
    full_name: "",
    mobile: "",
    avatar_url: "" as string | null,
    email: "",
    account_status: "",
  });
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function signed(path: string | null) {
    if (!path) return setPreview(null);
    const { data } = await supabase.storage.from("profile-images").createSignedUrl(path, 3600);
    setPreview(data?.signedUrl ?? null);
  }

  useEffect(() => {
    supabase
      .from("users")
      .select("full_name,mobile,avatar_url,email,account_status")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          toast.error("Could not load your profile.");
          return;
        }
        setProfile({
          full_name: data.full_name,
          mobile: data.mobile ?? "",
          avatar_url: data.avatar_url,
          email: data.email ?? user.email ?? "",
          account_status: data.account_status,
        });
        void signed(data.avatar_url);
      });
  }, [user.id, user.email]);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = schema.safeParse({ full_name: f.get("full_name"), mobile: f.get("mobile") });
    if (!r.success)
      return setErrors(
        Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])),
      );
    setErrors({});
    setSaving(true);
    const { error } = await supabase
      .from("users")
      .update({ full_name: r.data.full_name, mobile: r.data.mobile || null })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error("Could not save your profile.");
    setProfile((p) => ({ ...p, ...r.data }));
    toast.success("Profile updated.");
  }

  async function upload(file: File | undefined) {
    if (!file) return undefined;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      toast.error("Choose an image under 5 MB.");
      return undefined;
    }
    setUploading(true);
    const path = `${user.id}/avatar-${Date.now()}.${file.name.split(".").pop() ?? "jpg"}`;
    const { error } = await supabase.storage
      .from("profile-images")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (!error) {
      const { error: e2 } = await supabase
        .from("users")
        .update({ avatar_url: path })
        .eq("id", user.id);
      if (!e2) {
        if (profile.avatar_url)
          await supabase.storage.from("profile-images").remove([profile.avatar_url]);
        setProfile((p) => ({ ...p, avatar_url: path }));
        await signed(path);
        toast.success("Profile image updated.");
      } else toast.error("Could not save your profile image.");
    } else toast.error("Upload failed. Please try again.");
    setUploading(false);
    return undefined;
  }

  async function removeImage() {
    if (!profile.avatar_url) return;
    setUploading(true);
    const { error } = await supabase.from("users").update({ avatar_url: null }).eq("id", user.id);
    if (error) {
      setUploading(false);
      toast.error("Could not remove your profile image.");
      return;
    }
    await supabase.storage.from("profile-images").remove([profile.avatar_url]);
    setProfile((p) => ({ ...p, avatar_url: null }));
    setPreview(null);
    setUploading(false);
    toast.success("Profile image removed.");
  }

  return (
    <DashboardShell mode={mode}>
      <p className="text-xs font-semibold uppercase text-accent">Account</p>
      <h1 className="mt-2 font-display text-4xl font-bold">Your profile</h1>
      <p className="mt-2 text-muted-foreground">{meta}</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-[.7fr_1.3fr]">
        <section className="rounded-lg bg-surface p-6 text-center border border-line">
          <div className="mx-auto grid size-28 place-items-center overflow-hidden rounded-full bg-paper border border-line">
            {preview ? (
              <img src={preview} alt="Profile" className="size-full object-cover" />
            ) : (
              <UserRound className="size-12 text-muted-foreground" />
            )}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <label className="inline-flex">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => void upload(e.target.files?.[0])}
              />
              <span className="cursor-pointer rounded-md px-4 py-2 text-sm font-semibold border border-line hover:bg-paper">
                {uploading ? "Uploading…" : "Change image"}
              </span>
            </label>
            {profile.avatar_url && (
              <button
                type="button"
                disabled={uploading}
                onClick={() => void removeImage()}
                className="rounded-md px-4 py-2 text-sm font-semibold text-accent border border-line hover:bg-paper disabled:opacity-50"
              >
                Remove image
              </button>
            )}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Status:{" "}
            <span className="font-semibold capitalize text-foreground">
              {profile.account_status || "—"}
            </span>
          </p>
        </section>
        <form
          onSubmit={save}
          noValidate
          className="grid gap-5 rounded-lg bg-surface p-6 border border-line"
        >
          <Field
            key={`n-${profile.full_name}`}
            name="full_name"
            label="Full name"
            defaultValue={profile.full_name}
            error={errors["full_name"]}
          />
          <Field
            key={`m-${profile.mobile}`}
            name="mobile"
            type="tel"
            label="Mobile number"
            defaultValue={profile.mobile}
            error={errors["mobile"]}
          />
          <Field label="Email" value={profile.email} readOnly disabled />
          <p className="-mt-3 text-xs text-muted-foreground">
            Email changes require verification and are not editable here.
          </p>
          <Button disabled={saving} className="justify-self-start">
            {saving && <LoaderCircle className="animate-spin" />}Save changes
          </Button>
        </form>
      </div>
    </DashboardShell>
  );
}
