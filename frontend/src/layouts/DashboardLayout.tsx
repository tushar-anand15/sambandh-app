import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  toggleCollapsed: () => void;
  toggleMobile: () => void;
}

const SidebarContext = createContext<SidebarContextType | null>(null);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within DashboardLayout");
  }
  return context;
}

const SIDEBAR_COLLAPSED_KEY = "sidebar_collapsed";

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      return stored === "true";
    }
    return false;
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), []);
  const toggleMobile = useCallback(() => setMobileOpen((o) => !o), []);

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        setCollapsed,
        mobileOpen,
        setMobileOpen,
        toggleCollapsed,
        toggleMobile,
      }}
    >
      <div className="flex h-screen bg-canvas">
        {/* Mobile header */}
        <div className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center border-b border-border bg-surface px-4 lg:hidden">
          <button
            onClick={toggleMobile}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
          >
            <Menu size={22} />
          </button>
          <h1 className="ml-3 font-display text-lg tracking-tight text-indigo">
            GramSAMBANDH
          </h1>
        </div>

        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar */}
        <Sidebar />

        {/* Main content */}
        <main className="flex-1 overflow-auto pt-14 lg:pt-0">
          <Outlet />
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
