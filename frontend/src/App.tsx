import { Route, Routes } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardLayout from "@/layouts/DashboardLayout";
import ChatbotPage from "@/pages/ChatbotPage";
import ExplorerPage from "@/pages/ExplorerPage";
import ProtectedRoute from "@/components/dashboard/ProtectedRoute";

export default function App() {
  return (
    <AnimatePresence mode="wait">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="chat" element={<ChatbotPage />} />
          <Route path="explore" element={<ExplorerPage />} />
        </Route>
      </Routes>
    </AnimatePresence>
  );
}
