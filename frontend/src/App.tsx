import { Route, Routes } from "react-router-dom";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardLayout from "@/layouts/DashboardLayout";
import ChatbotPage from "@/pages/ChatbotPage";
import ExplorerPage from "@/pages/ExplorerPage";
import ProtectedRoute from "@/components/dashboard/ProtectedRoute";
import Masthead from "@/components/shell/Masthead";
import TabBar from "@/components/shell/TabBar";

/**
 * The shell is chrome, so it sits outside <Routes> and is not re-mounted on
 * navigation. There is no AnimatePresence: a page transition that fades in a
 * table of public spending buys nothing and delays the number.
 *
 * The section routes the tab bar points at arrive in Unit 6; the routes below
 * are the pre-revamp set and are replaced there and in Unit 10.
 */
export default function App() {
  return (
    <>
      <Masthead />
      <TabBar />
      <main>
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
      </main>
    </>
  );
}
