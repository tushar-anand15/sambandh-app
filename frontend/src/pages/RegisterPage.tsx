import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import styles from "./auth.module.css";

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
    <div className={`shell-container ${styles.page}`}>
      <div
        className={styles.panel}>
        <div className={styles.head}>
          <Link to="/" className={styles.wordmark}>
            Gram Sambandh
          </Link>
          <p className={styles.strap}>
            Create an account to use the assistant
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
            <span className={styles.label}>Full name</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className={styles.input}
              placeholder="Your name"
            />
          </label>

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
              minLength={8}
              className={styles.input}
              placeholder="At least 8 characters"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className={styles.submit}
          >
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className={styles.alt}>
          Already have an account?{" "}
          <Link
            to="/login"
            
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
