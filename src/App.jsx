import { Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './modules/auth/AuthProvider.jsx';
import LoginScreen from './modules/auth/LoginScreen.jsx';
import Dashboard from './modules/dashboard/Dashboard.jsx';
import LostCaseDetail from './modules/dashboard/LostCaseDetail.jsx';
import LostReportForm from './modules/lost-report/LostReportForm.jsx';
import FoundReportForm from './modules/found-report/FoundReportForm.jsx';
import FoundReportDetail from './modules/found-report/FoundReportDetail.jsx';
import MatchSettingsPage from './modules/settings/MatchSettingsPage.jsx';
import SettingsPage from './modules/settings/SettingsPage.jsx';
import CostSettingsPage from './modules/settings/CostSettingsPage.jsx';
import SmartIntakeForm from './modules/intake/SmartIntakeForm.jsx';
import ShareTargetIntake from './modules/intake/ShareTargetIntake.jsx';
import MatchAnalysisPage from './modules/matching/MatchAnalysisPage.jsx';
import { useHomeHistoryGuard } from './modules/shared/useHomeHistoryGuard.js';

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
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/lost/new" element={<LostReportForm />} />
        <Route path="/lost/:caseId" element={<LostCaseDetail />} />
        <Route path="/lost/:caseId/analysis/:foundReportId" element={<MatchAnalysisPage />} />
        <Route path="/found/new" element={<FoundReportForm />} />
        <Route path="/report/new" element={<SmartIntakeForm />} />
        <Route path="/share-target" element={<ShareTargetIntake />} />
        <Route path="/found/:reportId" element={<FoundReportDetail />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/matching" element={<MatchSettingsPage />} />
        <Route path="/settings/cost" element={<CostSettingsPage />} />
      </Routes>
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
