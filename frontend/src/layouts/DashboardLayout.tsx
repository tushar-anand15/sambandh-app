import { Outlet } from "react-router-dom";
import Sidebar from "@/components/dashboard/Sidebar";

export default function DashboardLayout() {
  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
