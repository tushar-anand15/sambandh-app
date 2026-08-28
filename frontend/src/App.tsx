import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardLayout from "@/layouts/DashboardLayout";
import ChatbotPage from "@/pages/ChatbotPage";
import ProtectedRoute from "@/components/dashboard/ProtectedRoute";
import ElectionsSection from "@/sections/ElectionsSection";
import FinancesSection from "@/sections/FinancesSection";
import HomeSection from "@/sections/HomeSection";
import MeetingsSection from "@/sections/MeetingsSection";
import MethodSection from "@/sections/MethodSection";
import Masthead from "@/components/shell/Masthead";
import SiteFooter from "@/components/shell/SiteFooter";
import { useRouteTelemetry } from "@/lib/telemetry";

/**
 * The route tree.
 *
 * Every view on this site has an address. A section route carries the body and
 * the period in the path — `/finances/M08032/2023-2024` — rather than in
 * component state, so a view can be linked, cited, bookmarked and reopened
 * months later. The optional segments mean the same route serves the empty
 * selector, a body with no period chosen, and the full selection, which is why
 * choosing never needs a redirect.
 *
 * `/ask` is the only gated route. Everything else answers with no token: these
 * are public records, and a login in front of a panchayat's expenditure would
 * be the site arguing against its own premise. An account exists only so the
 * assistant can save your questions and their answers.
 *
 * There is no Maps tab. Boundary layers live under Elections, which is where
 * the map already is, so `/maps` sends the reader there rather than 404ing a
 * link that was reasonable to guess.
 *
 * `/method` has no tab either. It is linked from the home page and from the
 * footer, which is where a reader goes after a figure surprises them, and a
 * sixth tab would put a page about the build alongside four pages of data.
 *
 * The shell is chrome, so it sits outside <Routes> and is not re-mounted on
 * navigation. That is what lets the masthead keep its collapsed/expanded state
 * across a navigation instead of re-deciding it from scratch on every paint.
 * There is no AnimatePresence: a page transition that fades in a table of
 * public spending buys nothing and delays the number.
 */

export default function App() {
  // Client-side routing means the collector never sees a section change
  // unless something fires on it. Mounted once, here, at the root.
  useRouteTelemetry();

  return (
    <>
      <Masthead />
      <main>
        <Routes>
          <Route path="/" element={<HomeSection />} />
          <Route path="/method" element={<MethodSection />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route
            path="/finances/:lb?/:year?"
            element={
              <FinancesSection />
            }
          />
          <Route
            path="/meetings/:lb?/:year?"
            element={
              <MeetingsSection />
            }
          />
          <Route
            path="/elections/:lb?/:cycle?"
            element={
              <ElectionsSection />
            }
          />

          {/* Folded into Elections. Kept as a redirect, not a 404. */}
          <Route path="/maps" element={<Navigate to="/elections" replace />} />

          <Route
            path="/ask"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<ChatbotPage />} />
          </Route>

          {/* The pre-revamp addresses. Their content now lives at /ask. */}
          <Route path="/dashboard/*" element={<Navigate to="/ask" replace />} />
        </Routes>
      </main>
      <SiteFooter />
    </>
  );
}
