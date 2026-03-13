export default function Footer() {
  return (
    <footer className="border-t border-border bg-surface-alt py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 md:flex-row">
        <div>
          <p className="font-display text-lg text-ink">
            Gram<span className="text-indigo">SAMBANDH</span>
          </p>
          <p className="mt-0.5 text-xs text-ink-faint">
            Civic transparency through accessible public data
          </p>
        </div>

        <div className="flex items-center gap-6 text-xs text-ink-muted">
          <a
            href="https://gramsambandh.in"
            className="transition-colors hover:text-ink"
            target="_blank"
            rel="noopener noreferrer"
          >
            gramsambandh.in
          </a>
          <span className="text-border">|</span>
          <a
            href="mailto:csabishek@gmail.com"
            className="transition-colors hover:text-ink"
          >
            Contact
          </a>
          <span className="text-border">|</span>
          <span>Demo v1 &middot; Not for production use</span>
        </div>
      </div>
    </footer>
  );
}
