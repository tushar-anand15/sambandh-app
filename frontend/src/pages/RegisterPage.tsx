import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Where ProtectedRoute turned them away from, or the assistant — the only
  // route on this site that needs an account at all.
  const destination =
    (location.state as { from?: string } | null)?.from ?? "/ask";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("The password has to be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await register(email, password, fullName);
      navigate(destination);
    } catch (err: any) {
      setError(err.response?.data?.detail || "The account could not be created. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div
        className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link to="/" className="font-display text-2xl tracking-tight text-ink">
            Gram<span className="text-indigo">SAMBANDH</span>
          </Link>
          <p className="mt-2 text-sm text-ink-muted">
            Create an account to use the assistant
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-border bg-surface p-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)]"
        >
          {error && (
            <div className="mb-4 rounded-lg bg-error/5 px-3 py-2 text-sm text-error">
              {error}
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-ink-muted">Full name</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="mt-1.5 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-indigo focus:ring-0 focus:outline-none"
              placeholder="Your name"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-xs font-medium text-ink-muted">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1.5 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-indigo focus:ring-0 focus:outline-none"
              placeholder="you@example.com"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-xs font-medium text-ink-muted">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1.5 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-indigo focus:ring-0 focus:outline-none"
              placeholder="At least 8 characters"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center rounded-lg bg-indigo px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-hover disabled:opacity-60"
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              "Create account"
            )}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-muted">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-indigo transition-colors hover:text-indigo-hover"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
