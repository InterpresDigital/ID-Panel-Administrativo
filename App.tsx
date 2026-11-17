
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Finance from './pages/Finance';
import ImpuestosPage from './pages/ImpuestosPage';
import Tasks from './pages/Tasks';
import Login from './pages/Login'; // New
import Configuration from './pages/Configuration';
import Agreements from './pages/Agreements';
import SignAgreement from './pages/SignAgreement';
import Platforms from './pages/Platforms';
import WorkLogs from './pages/WorkLogs';
import MaintenanceLogs from './pages/MaintenanceLogs';
import Quotations from './pages/Quotations';
import ViewQuotation from './pages/ViewQuotation';
import Bookings from './pages/Bookings';
import ControlCenter from './pages/ControlCenter';
import PublicBooking from './pages/PublicBooking';
import PublicCancelBooking from './pages/PublicCancelBooking';
import PublicBriefing from './pages/PublicBriefing';
import BriefingsAdmin from './pages/BriefingsAdmin';
import PublicGeneralBriefing from './pages/PublicGeneralBriefing';
import BriefingsGeneralAdmin from './pages/BriefingsGeneralAdmin';
import PublicAiBriefing from './pages/PublicAiBriefing';
import BriefingsAiAdmin from './pages/BriefingsAiAdmin';
import LegalDocumentsAdmin from './pages/LegalDocumentsAdmin';
import SignLegalDocument from './pages/SignLegalDocument';
import { ThemeProvider } from './components/ThemeContext';
import { DataProvider } from './context/DataContext';
import { AuthProvider, useAuth } from './context/AuthContext'; // New

// Component to protect routes
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  console.log("App Version: 1.0.2 - Booking Integration");
  return (
    <DataProvider>
      <AuthProvider>
        <ThemeProvider>
          <HashRouter>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/sign/:agreementId" element={<SignAgreement />} />
              <Route path="/quote/:quoteId" element={<ViewQuotation />} />
              <Route path="/book" element={<PublicBooking />} />
              <Route path="/book/:platformSlug" element={<PublicBooking />} />
              <Route path="/cancel-booking/:bookingId" element={<PublicCancelBooking />} />
              <Route path="/briefing/lumina-core" element={<PublicBriefing />} />
              <Route path="/briefing/lumina-core/:clientId" element={<PublicBriefing />} />
              <Route path="/briefing/general" element={<PublicGeneralBriefing />} />
              <Route path="/briefing/general/:clientId" element={<PublicGeneralBriefing />} />
              <Route path="/briefing/ia" element={<PublicAiBriefing />} />
              <Route path="/briefing/ia/:clientId" element={<PublicAiBriefing />} />
              <Route path="/sign/legal/:docId/:signerIndex" element={<SignLegalDocument />} />

              {/* Protected Routes wrapped in Layout */}
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/clients" element={<Clients />} />
                        <Route path="/tasks" element={<Tasks />} />
                        <Route path="/finance" element={<Finance />} />
                        <Route path="/impuestos" element={<ImpuestosPage />} />
                        <Route path="/configuration" element={<Configuration />} />
                        <Route path="/agreements" element={<Agreements />} />
                        <Route path="/briefings" element={<BriefingsAdmin />} />
                        <Route path="/briefings-general" element={<BriefingsGeneralAdmin />} />
                        <Route path="/briefings-ia" element={<BriefingsAiAdmin />} />
                        <Route path="/legal-documents" element={<LegalDocumentsAdmin />} />
                        <Route path="/platforms" element={<Platforms />} />
                        <Route path="/work-logs" element={<WorkLogs />} />
                        <Route path="/maintenance-logs" element={<MaintenanceLogs />} />
                        <Route path="/quotations" element={<Quotations />} />
                        <Route path="/bookings" element={<Bookings />} />
                        <Route path="/control-center" element={<ControlCenter />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </Layout>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </HashRouter>
        </ThemeProvider>
      </AuthProvider>
    </DataProvider>
  );
};

export default App;
