import { Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardLayout from "@/layouts/DashboardLayout";
import ChatbotPage from "@/pages/ChatbotPage";
import ProtectedRoute from "@/components/dashboard/ProtectedRoute";
import BodySelector from "@/components/select/BodySelector";
import Masthead from "@/components/shell/Masthead";
import TabBar from "@/components/shell/TabBar";
import type { Section } from "@/hooks/useBodies";

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
 * The shell is chrome, so it sits outside <Routes> and is not re-mounted on
 * navigation. There is no AnimatePresence: a page transition that fades in a
 * table of public spending buys nothing and delays the number.
 */

interface SectionRouteProps {
  section: Section;
  title: string;
  lede: string;
}

/**
 * A section page, pending its content.
 *
 * The heading, the lede and the selector are this unit's work; the figures
 * below them are Units 7, 8 and 9. Shipping the selector against a stated
 * placeholder is deliberate — the selection contract is testable now, and the
 * three sections inherit a control that already behaves rather than each
 * growing its own.
 */
function SectionRoute({ section, title, lede }: SectionRouteProps) {
  return (
    <div className="shell-container section-page">
      <h1>{title}</h1>
      <p className="lede">{lede}</p>
      <BodySelector section={section} />
    </div>
  );
}

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
            path="/finances/:lb?/:year?"
            element={
              <SectionRoute
                section="finances"
                title="Finances"
                lede="What a local body planned and what it spent, year by year, from the Sulekha plan monitoring portal."
              />
            }
          />
          <Route
            path="/meetings/:lb?/:year?"
            element={
              <SectionRoute
                section="meetings"
                title="Meetings"
                lede="Meetings held, by category and by nature, from the Sakarma meeting manifest."
              />
            }
          />
          <Route
            path="/elections/:lb?/:cycle?"
            element={
              <SectionRoute
                section="elections"
                title="Elections"
                lede="Ward-level results across the 2010, 2015, 2020 and 2025 cycles, with the boundary layers they are drawn on."
              />
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
    </>
  );
}
