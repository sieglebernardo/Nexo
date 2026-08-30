import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";

import { getAdminSession } from "../api/client.js";
import { authClient } from "../auth/client.js";
import { FieldLabel } from "../ui/FieldLabel.js";

const AdminDashboard = lazy(async () => {
  const module = await import("./AdminApp.js");
  return { default: module.AdminApp };
});

function AdminSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    const result = await authClient.signIn.email({ email, password });
    setSubmitting(false);
    if (result.error) setError(result.error.message ?? "Could not sign in");
  };

  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div>
          <span className="eyebrow eyebrow-inverse">Nexo</span>
          <h1>Welcome back.</h1>
          <p>Sign in with your verified account to continue.</p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <h2>Sign in</h2>
          <form className="stack-form" onSubmit={submit}>
            <label>
              <FieldLabel required>Email</FieldLabel>
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label>
              <FieldLabel required>Password</FieldLabel>
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            {error && <div className="notice is-error">{error}</div>}
            <button className="primary-button" disabled={submitting} type="submit">
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

export function AdminGate() {
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const isLogin = window.location.pathname === "/admin/login";
  const admin = useQuery({
    enabled: Boolean(session.data?.user),
    queryFn: ({ signal }) => getAdminSession(signal),
    queryKey: ["admin", "session"],
    refetchOnMount: "always",
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (session.isPending) return;
    if (!session.data?.user) {
      if (!isLogin) window.location.replace("/admin/login");
      return;
    }
    if (admin.isPending) return;
    if (admin.isError) {
      queryClient.removeQueries({ queryKey: ["admin"] });
      window.location.replace("/");
      return;
    }
    if (isLogin) window.location.replace("/admin");
  }, [admin.isError, admin.isPending, isLogin, queryClient, session.data?.user, session.isPending]);

  if (session.isPending || (session.data?.user && admin.isPending) || admin.isError) return null;
  if (!session.data?.user) return isLogin ? <AdminSignIn /> : null;

  return (
    <Suspense fallback={null}>
      <AdminDashboard
        onSignOut={async () => {
          await authClient.signOut();
          queryClient.removeQueries({ queryKey: ["admin"] });
          window.location.replace("/");
        }}
      />
    </Suspense>
  );
}
