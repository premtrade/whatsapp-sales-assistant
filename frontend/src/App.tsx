import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import LandingPage from './pages/LandingPage'
import BlogPage from './pages/Blog'
import BlogPostPage from './pages/BlogPost'
import FAQPage from './pages/FAQ'
import PrivacyPage from './pages/Privacy'
import TermsPage from './pages/Terms'
import { LoginPage } from './pages/Login'
import SignupPage from './pages/Signup'
import SetupPage from './pages/Setup'
import AcceptInvitePage from './pages/AcceptInvite'

// The operator console is split out so a prospect reading the marketing site
// never downloads the dashboard screens.
const AuthenticatedApp = lazy(() => import('./AuthenticatedApp'))

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50">
      <div className="w-8 h-8 border-3 border-surface-200 border-t-primary-600 rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route
          path="/*"
          element={
            <Suspense fallback={<RouteFallback />}>
              <AuthenticatedApp />
            </Suspense>
          }
        />
      </Routes>
    </>
  )
}
