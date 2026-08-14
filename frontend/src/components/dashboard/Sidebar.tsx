import { NavLink, useNavigate } from "react-router-dom";
import { MessageSquareText, LogOut, PanelLeftClose, PanelLeft, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSidebar } from "@/layouts/DashboardLayout";

// The explorer entry is gone: browsing the data no longer needs an account, so
// it lives in the public sections rather than behind this sidebar.
const navItems = [{ to: "/ask", icon: MessageSquareText, label: "Assistant" }];

export default function Sidebar() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } = useSidebar();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const handleNavClick = () => {
    if (mobileOpen) {
      setMobileOpen(false);
    }
  };

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-surface-alt
        transition-all duration-200 ease-in-out
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:relative lg:translate-x-0
        ${collapsed ? "lg:w-[68px]" : "lg:w-[240px]"}
        w-[280px]
      `}
    >
      {/* Header */}
      <div className={`flex items-center border-b border-border/50 ${collapsed ? "justify-center px-2 py-4" : "justify-between px-4 py-4"}`}>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="font-display text-lg tracking-tight text-indigo">
              GramSAMBANDH
            </h1>
            <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-widest text-ink-faint">
              Sulekha Explorer
            </p>
          </div>
        )}
        
        {/* Desktop collapse toggle */}
        <button
          onClick={toggleCollapsed}
          className="hidden h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink lg:flex"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>

        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink lg:hidden"
        >
          <X size={20} />
        </button>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 ${collapsed ? "px-2" : "px-3"} py-3`}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={handleNavClick}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `mb-1 flex items-center rounded-lg transition-all duration-150 ${
                collapsed
                  ? "justify-center px-0 py-2.5"
                  : "gap-3 px-3 py-2.5"
              } ${
                isActive
                  ? "bg-indigo-subtle text-indigo"
                  : "text-ink-muted hover:bg-surface hover:text-ink"
              }`
            }
          >
            <Icon size={20} strokeWidth={1.8} />
            {!collapsed && <span className="text-sm font-medium">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className={`border-t border-border ${collapsed ? "px-2" : "px-3"} py-3`}>
        <button
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          className={`flex w-full items-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-error ${
            collapsed
              ? "justify-center px-0 py-2.5"
              : "gap-3 px-3 py-2.5"
          }`}
        >
          <LogOut size={20} strokeWidth={1.8} />
          {!collapsed && <span className="text-sm font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
