import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import { ThemeProvider } from './components/ThemeContext';
import { DataProvider } from './context/DataContext';
import { AuthProvider, useAuth } from './context/AuthContext';

// Carga bajo demanda (Code-Splitting) para evitar descargar 3.2 MB de JS en el arranque inicial
const Clients = lazy(() => import('./pages/Clients'));
const Finance = lazy(() => import('./pages/Finance'));
const ImpuestosPage = lazy(() => import('./pages/ImpuestosPage'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Configuration = lazy(() => import('./pages/Configuration'));
const Agreements = lazy(() => import('./pages/Agreements'));
const SignAgreement = lazy(() => import('./pages/SignAgreement'));
const Platforms = lazy(() => import('./pages/Platforms'));
const WorkLogs = lazy(() => import('./pages/WorkLogs'));
const MaintenanceLogs = lazy(() => import('./pages/MaintenanceLogs'));
const Quotations = lazy(() => import('./pages/Quotations'));
const ViewQuotation = lazy(() => import('./pages/ViewQuotation'));
const Bookings = lazy(() => import('./pages/Bookings'));
const ControlCenter = lazy(() => import('./pages/ControlCenter'));
const PublicBooking = lazy(() => import('./pages/PublicBooking'));
const PublicCancelBooking = lazy(() => import('./pages/PublicCancelBooking'));
const PublicBriefing = lazy(() => import('./pages/PublicBriefing'));
const BriefingsAdmin = lazy(() => import('./pages/BriefingsAdmin'));
const PublicGeneralBriefing = lazy(() => import('./pages/PublicGeneralBriefing'));
const BriefingsGeneralAdmin = lazy(() => import('./pages/BriefingsGeneralAdmin'));
const PublicAiBriefing = lazy(() => import('./pages/PublicAiBriefing'));
const BriefingsAiAdmin = lazy(() => import('./pages/BriefingsAiAdmin'));
const LegalDocumentsAdmin = lazy(() => import('./pages/LegalDocumentsAdmin'));
const SignLegalDocument = lazy(() => import('./pages/SignLegalDocument'));

const RouteFallback = () => (
  <div className="flex min-h-[50vh] w-full items-center justify-center">
    <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

// Component to protect routes
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <DataProvider>
      <AuthProvider>
        <ThemeProvider>
          <HashRouter>
            <Suspense fallback={<RouteFallback />}>
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
                        <Suspense fallback={<RouteFallback />}>
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
                        </Suspense>
                      </Layout>
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </Suspense>
          </HashRouter>
        </ThemeProvider>
      </AuthProvider>
    </DataProvider>
  );
};

export default App;
