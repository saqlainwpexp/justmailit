import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const navigate  = useNavigate()
  const { signIn } = useAuth()
  const token = params.get('token')

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [resendEmail, setResendEmail] = useState('')
  const [resendSent, setResendSent] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('No verification token found in the link.'); return }
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setStatus('success')
          setTimeout(() => navigate('/', { replace: true }), 2500)
        } else {
          setStatus('error')
          setMessage(data.error || 'Verification failed.')
        }
      })
      .catch(() => { setStatus('error'); setMessage('Network error. Please try again.') })
  }, [token, navigate])

  async function handleResend(e: React.FormEvent) {
    e.preventDefault()
    if (!resendEmail) return
    setResendLoading(true)
    await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resendEmail }),
    })
    setResendLoading(false)
    setResendSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm p-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-[#2d5a3d] flex items-center justify-center">
            <Mail className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg text-[#1a3526] tracking-tight">KeepMailing</span>
        </div>

        {status === 'loading' && (
          <>
            <Loader2 className="w-10 h-10 text-[#2d5a3d] animate-spin mx-auto mb-4" />
            <h2 className="font-semibold text-gray-900 mb-1">Verifying your email…</h2>
            <p className="text-sm text-gray-500">Just a moment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-14 h-14 bg-[#f0f7f2] rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-[#2d5a3d]" />
            </div>
            <h2 className="font-semibold text-gray-900 mb-1">Email verified!</h2>
            <p className="text-sm text-gray-500 mb-4">Your account is now active. Redirecting you to the dashboard…</p>
            <Link to="/" className="text-sm font-semibold text-[#2d5a3d] hover:underline">Go to dashboard →</Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="font-semibold text-gray-900 mb-1">Link expired or invalid</h2>
            <p className="text-sm text-gray-500 mb-6">{message}</p>

            {!resendSent ? (
              <form onSubmit={handleResend} className="text-left space-y-3">
                <p className="text-xs font-semibold text-gray-700 text-center mb-2">Request a new verification link</p>
                <input
                  type="email"
                  value={resendEmail}
                  onChange={e => setResendEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d]"
                />
                <button
                  type="submit"
                  disabled={!resendEmail || resendLoading}
                  className="w-full py-2.5 text-sm font-semibold bg-[#2d5a3d] hover:bg-[#245030] disabled:opacity-50 text-white rounded-xl transition-colors"
                >
                  {resendLoading ? 'Sending…' : 'Resend verification email'}
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2 bg-[#f0f7f2] border border-[#c8e0cf] rounded-xl px-4 py-3 text-sm text-[#2d5a3d]">
                <CheckCircle className="w-4 h-4 shrink-0" />
                New link sent — check your inbox.
              </div>
            )}

            <Link to="/signin" className="block mt-4 text-xs font-semibold text-[#2d5a3d] hover:underline">← Back to sign in</Link>
          </>
        )}
      </div>
    </div>
  )
}
