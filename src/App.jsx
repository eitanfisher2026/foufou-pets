import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './modules/auth/AuthProvider.jsx';
import LoginScreen from './modules/auth/LoginScreen.jsx';
import Dashboard from './modules/dashboard/Dashboard.jsx';
import { useHomeHistoryGuard } from './modules/shared/useHomeHistoryGuard.js';

// Every other route used to be a plain top-level import, so the ENTIRE
// app - every settings page, every form, every detail page - shipped as
// one bundle before anything could render, even the login screen someone
// not yet signed in is looking at. Lazy-loading everything except the two
// routes almost everyone hits first (the login screen, and the dashboard
// right after) splits those out into their own chunks, fetched only once
// actually navigated to - the admin-only settings pages in particular are
// dead weight for every non-admin visitor otherwise.
const LostCaseDetail = lazy(() => import('./modules/dashboard/LostCaseDetail.jsx'));
const LostReportForm = lazy(() => import('./modules/lost-report/LostReportForm.jsx'));
const FoundReportForm = lazy(() => import('./modules/found-report/FoundReportForm.jsx'));
const FoundReportDetail = lazy(() => import('./modules/found-report/FoundReportDetail.jsx'));
const MatchSettingsPage = lazy(() => import('./modules/settings/MatchSettingsPage.jsx'));
const SettingsPage = lazy(() => import('./modules/settings/SettingsPage.jsx'));
const CostSettingsPage = lazy(() => import('./modules/settings/CostSettingsPage.jsx'));
const UsersSettingsPage = lazy(() => import('./modules/settings/UsersSettingsPage.jsx'));
const SmartIntakeForm = lazy(() => import('./modules/intake/SmartIntakeForm.jsx'));
const ShareTargetIntake = lazy(() => import('./modules/intake/ShareTargetIntake.jsx'));
const MatchAnalysisPage = lazy(() => import('./modules/matching/MatchAnalysisPage.jsx'));
const FoundReportsListPage = lazy(() => import('./modules/dashboard/FoundReportsListPage.jsx'));
const ArchivePage = lazy(() => import('./modules/dashboard/ArchivePage.jsx'));

// Settings (parameters, costs, user management) is admin-only - editors and
// regular users shouldn't even know it exists, per the role spec, not just
// be blocked from the actions inside it. Firestore rules are the real
// enforcement; this just keeps the UI from ever showing it to begin with.
function RequireAdmin({ children }) {
  const { isAdmin, roleLoading } = useAuth();
  if (roleLoading) return <p className="p-8 text-center text-slate-500">טוען...</p>;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  useHomeHistoryGuard();

  if (loading) return <p className="p-8 text-center text-slate-500">טוען...</p>;
  if (!user) return <LoginScreen />;

  // One responsive width cap for the whole app, same pattern as Buli: pages
  // themselves stay full-width and just fill this container, so the app
  // reads as a phone-width column on mobile but actually uses the extra
  // space on tablet/laptop screens instead of sitting in a narrow strip.
  return (
    <div className="mx-auto max-w-md sm:max-w-xl md:max-w-2xl lg:max-w-3xl xl:max-w-4xl">
      <Suspense fallback={<p className="p-8 text-center text-slate-500">טוען...</p>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/found" element={<FoundReportsListPage />} />
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="/lost/new" element={<LostReportForm />} />
          <Route path="/lost/:caseId" element={<LostCaseDetail />} />
          <Route path="/lost/:caseId/analysis/:foundReportId" element={<MatchAnalysisPage />} />
          <Route path="/found/new" element={<FoundReportForm />} />
          <Route path="/report/new" element={<SmartIntakeForm />} />
          <Route path="/share-target" element={<ShareTargetIntake />} />
          <Route path="/found/:reportId" element={<FoundReportDetail />} />
          <Route
            path="/settings"
            element={
              <RequireAdmin>
                <SettingsPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/settings/matching"
            element={
              <RequireAdmin>
                <MatchSettingsPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/settings/cost"
            element={
              <RequireAdmin>
                <CostSettingsPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/settings/users"
            element={
              <RequireAdmin>
                <UsersSettingsPage />
              </RequireAdmin>
            }
          />
        </Routes>
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
