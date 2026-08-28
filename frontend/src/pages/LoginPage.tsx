import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import styles from "./auth.module.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Where ProtectedRoute turned them away from, or the assistant — the only
  // route on this site that needs an account at all.
  const destination =
    (location.state as { from?: string } | null)?.from ?? "/ask";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate(destination);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Sign in failed. Check the email address and the password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`shell-container ${styles.page}`}>
      <div
        className={styles.panel}>
        <div className={styles.head}>
          <Link to="/" className={styles.wordmark}>
            Gram Sambandh
          </Link>
          <p className={styles.strap}>
            Sign in to use the assistant
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className={styles.form}
        >
          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          <label className={styles.field}>
            <span className={styles.label}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={styles.input}
              placeholder="you@example.com"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={styles.input}
              placeholder="At least 8 characters"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className={styles.submit}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className={styles.alt}>
          No account yet?{" "}
          <Link
            to="/register"
            
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
