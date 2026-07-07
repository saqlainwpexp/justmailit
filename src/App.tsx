import { Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Campaigns from './pages/Campaigns'
import CampaignWizard from './pages/campaigns/CampaignWizard'
import Automation from './pages/Automation'
import Inbox from './pages/Inbox'
import Contacts from './pages/Contacts'
import EmailAccounts from './pages/EmailAccounts'
import Domains from './pages/Domains'
import Templates from './pages/Templates'
import Forms from './pages/Forms'
import Segments from './pages/Segments'
import Settings from './pages/Settings'
import Pricing from './pages/Pricing'
import AdminPanel from './pages/AdminPanel'
import Invites from './pages/Invites'
import SignIn from './pages/auth/SignIn'
import SignUp from './pages/auth/SignUp'
import ForgotPassword from './pages/auth/ForgotPassword'
import VerifyEmail from './pages/auth/VerifyEmail'
import LandingPage from './pages/public/LandingPage'
import EmbedForm from './pages/public/EmbedForm'

export default function App() {
  return (
    <Routes>
      {/* Public auth routes */}
      <Route path="/signin" element={<SignIn />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />

      {/* Public, unauthenticated — embeddable forms and standalone landing pages */}
      <Route path="/lp/:slug" element={<LandingPage />} />
      <Route path="/embed/form/:id" element={<EmbedForm />} />

      {/* All app routes require authentication */}
      <Route element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      }>
        <Route path="/" element={<Dashboard />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/campaigns/new" element={<CampaignWizard />} />
        <Route path="/campaigns/:id/edit" element={<CampaignWizard />} />
        <Route path="/automation" element={<Automation />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/segments" element={<Segments />} />
        <Route path="/accounts" element={<EmailAccounts />} />
        <Route path="/domains" element={<Domains />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/forms" element={<Forms />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/invites" element={<Invites />} />
      </Route>
    </Routes>
  )
}
