import type { EnvStatus } from "@/lib/env";

type ConfigNoticeProps = {
  status: EnvStatus;
};

export function ConfigNotice({ status }: ConfigNoticeProps) {
  const missing: string[] = [];
  if (!status.clerk) missing.push("Clerk (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY)");
  if (!status.convex) missing.push("Convex (NEXT_PUBLIC_CONVEX_URL)");

  if (missing.length === 0) return null;

  return (
    <div className="nexus-config-notice" role="status">
      <strong>Configuration required.</strong> Copy <code>.env.example</code> to{" "}
      <code>.env.local</code> and set: {missing.join("; ")}. This notice disappears when
      both integrations are configured.
    </div>
  );
}
