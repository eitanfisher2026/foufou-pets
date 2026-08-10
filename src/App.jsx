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

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <p className="p-8 text-center text-slate-500">טוען...</p>;
  if (!user) return <LoginScreen />;

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/lost/new" element={<LostReportForm />} />
      <Route path="/lost/:caseId" element={<LostCaseDetail />} />
      <Route path="/found/new" element={<FoundReportForm />} />
      <Route path="/report/new" element={<SmartIntakeForm />} />
      <Route path="/found/:reportId" element={<FoundReportDetail />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/settings/matching" element={<MatchSettingsPage />} />
      <Route path="/settings/cost" element={<CostSettingsPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
