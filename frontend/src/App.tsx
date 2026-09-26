import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { AppLayout } from './components/Layout/AppLayout'
import LandingPage from './pages/LandingPage'
import { LoginPage } from './pages/Login'
import SignupPage from './pages/Signup'
import SetupPage from './pages/Setup'
import AcceptInvitePage from './pages/AcceptInvite'
import { DashboardPage } from './pages/Dashboard'
import { InboxPage } from './pages/Inbox'
import { ConversationDetailPage } from './pages/ConversationDetail'
import { CustomersPage } from './pages/Customers'
import { CustomerDetailPage } from './pages/CustomerDetail'
import { Customer360Page } from './pages/Customer360'
import { LeadsPage } from './pages/Leads'
import { QuotesPage } from './pages/Quotes'
import { AppointmentsPage } from './pages/Appointments'
import { KnowledgePage } from './pages/Knowledge'
import { HandoffsPage } from './pages/Handoffs'
import { AIActivityPage } from './pages/AIActivity'
import { AnalyticsPage } from './pages/Analytics'
import { ConversionFunnelPage } from './pages/ConversionFunnel'
import { SettingsPage } from './pages/Settings'
import { LeadPipelinePage } from './pages/LeadPipeline'
import PlansPage from './pages/Plans'
import OwnerDashboardPage from './pages/OwnerDashboard'
import BillingPage from './pages/Billing'

function RequireAuth({ children }: { children: JSX.Element }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="w-8 h-8 border-3 border-surface-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppLayout>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="/inbox" element={<InboxPage />} />
                <Route path="/inbox/:id" element={<ConversationDetailPage />} />
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/customers/:id" element={<CustomerDetailPage />} />
                <Route path="/customers/:id/360" element={<Customer360Page />} />
                <Route path="/leads" element={<LeadsPage />} />
                <Route path="/lead-pipeline" element={<LeadPipelinePage />} />
                <Route path="/quotes" element={<QuotesPage />} />
                <Route path="/appointments" element={<AppointmentsPage />} />
                <Route path="/knowledge" element={<KnowledgePage />} />
                <Route path="/handoffs" element={<HandoffsPage />} />
                <Route path="/ai-activity" element={<AIActivityPage />} />
                <Route path="/analytics/funnel" element={<ConversionFunnelPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/plans" element={<PlansPage />} />
                <Route path="/owner" element={<OwnerDashboardPage />} />
                <Route path="/billing" element={<BillingPage />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </AppLayout>
          </RequireAuth>
        }
      />
    </Routes>
  )
}
