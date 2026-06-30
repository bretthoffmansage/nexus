import { SignIn } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/env";

export default function SignInPage() {
  if (!isClerkConfigured()) {
    return (
      <div className="nexus-sign-in-shell">
        <div className="nexus-sign-in-panel nexus-card">
          <h1 className="nexus-card-title" style={{ textAlign: "center" }}>
            Nexus
          </h1>
          <p className="nexus-sign-in-copy">
            Clerk is not configured. Add <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
            <code>CLERK_SECRET_KEY</code> to <code>.env.local</code>, then restart the dev
            server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="nexus-sign-in-shell">
      <div className="nexus-sign-in-panel">
        <h1 className="nexus-card-title" style={{ textAlign: "center", marginBottom: "0.25rem" }}>
          Nexus
        </h1>
        <p className="nexus-sign-in-copy">Sign in to continue</p>
        <SignIn routing="path" path="/sign-in" signUpUrl="/sign-in" />
      </div>
    </div>
  );
}
