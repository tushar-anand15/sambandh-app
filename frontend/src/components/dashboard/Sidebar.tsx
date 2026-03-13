import { NavLink, useNavigate } from "react-router-dom";
import { MessageSquareText, Search, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { to: "/dashboard/chat", icon: MessageSquareText, label: "Chatbot" },
  { to: "/dashboard/explore", icon: Search, label: "Data Explorer" },
];

export default function Sidebar() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <aside className="flex w-[240px] flex-col border-r border-border bg-surface-alt">
      <div className="px-6 py-6">
        <h1 className="font-display text-xl tracking-tight text-indigo">
          GramSAMBANDH
        </h1>
        <p className="mt-0.5 text-[11px] font-medium uppercase tracking-widest text-ink-faint">
          Sulekha Explorer
        </p>
      </div>

      <nav className="flex-1 px-3">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-indigo-subtle text-indigo"
                  : "text-ink-muted hover:bg-surface hover:text-ink"
              }`
            }
          >
            <Icon size={18} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border px-3 py-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface hover:text-error"
        >
          <LogOut size={18} strokeWidth={1.8} />
          Logout
        </button>
      </div>
    </aside>
  );
}
