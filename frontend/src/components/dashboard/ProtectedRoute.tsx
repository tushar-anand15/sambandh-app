import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { ReactNode } from "react";

/**
 * The gate, and it now guards exactly one route: `/ask`.
 *
 * It used to wrap `/dashboard/*`, which put the whole site behind a login. On a
 * repository of public records that was the wrong default — the finances,
 * meetings and elections sections answer with no token, and only the assistant
 * needs an account, because an account is what saves your questions and their
 * answers.
 *
 * Where the visitor was headed travels with the redirect, so signing in returns
 * them to the page they asked for rather than a generic landing.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="shell-container section-page">
        <p className="selector-status">Checking your sign-in…</p>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
