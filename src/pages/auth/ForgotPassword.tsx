import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowLeft, Loader2, CheckCircle, AlertCircle, ShieldCheck } from 'lucide-react'

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const emailValid = validateEmail(email)
  const canSubmit = emailValid && !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError('')
    await new Promise(r => setTimeout(r, 1200))
    setLoading(false)
    setDone(true)
  }

  return (
    <div className="min-h-screen bg-[#f6f8f6] flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-10">
        <div className="w-8 h-8 rounded-lg bg-[#2d5a3d] flex items-center justify-center">
          <Mail className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-lg text-[#1a3526] tracking-tight">justmailit</span>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-md p-8">
        {done ? (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-[#f0f7f2] flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-7 h-7 text-[#2d5a3d]" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Check your email</h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-6">
              If <span className="font-semibold text-gray-700">{email}</span> is associated with an Emailit account, you'll receive a password reset link within a few minutes.
            </p>
            <div className="bg-[#f0f7f2] border border-[#c8e0cf] rounded-xl p-4 text-left space-y-1.5 mb-6">
              <p className="text-xs font-semibold text-[#2d5a3d]">Didn't receive it?</p>
              <p className="text-[11px] text-[#4a7c59]">• Check your spam or junk folder</p>
              <p className="text-[11px] text-[#4a7c59]">• The link expires after 1 hour</p>
              <button
                onClick={() => setDone(false)}
                className="text-[11px] font-semibold text-[#2d5a3d] hover:underline"
              >
                • Try a different email address
              </button>
            </div>
            <Link
              to="/signin"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#2d5a3d] hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-7">
              <div className="w-14 h-14 rounded-full bg-[#f0f7f2] flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-7 h-7 text-[#2d5a3d]" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">Forgot your password?</h1>
              <p className="text-sm text-gray-500 leading-relaxed">
                No worries. Enter your email and we'll send you a secure reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <input type="hidden" name="_csrf" value="csrf_token_placeholder" />

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError('') }}
                    placeholder="you@yourdomain.com"
                    className={`w-full pl-10 pr-4 py-2.5 text-sm border rounded-xl bg-white outline-none transition-all
                      focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d]
                      ${email && !emailValid ? 'border-red-300 bg-red-50/30' : 'border-gray-200 hover:border-gray-300'}`}
                    autoFocus
                  />
                </div>
                {email && !emailValid && <p className="text-[11px] text-red-500 mt-1">Enter a valid email address</p>}
              </div>

              {error && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl p-3">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}

              {/* Security note */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-[11px] text-gray-500 leading-relaxed">
                For security, the reset link expires in <strong className="text-gray-700">1 hour</strong> and can only be used once. If you didn't request this, ignore it — your password won't change.
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d5a3d] hover:bg-[#245030] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all shadow-sm"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Sending reset link…</>
                ) : 'Send reset link'}
              </button>
            </form>

            <div className="flex items-center justify-center mt-5">
              <Link
                to="/signin"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#2d5a3d] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>

      <p className="text-[10px] text-gray-400 text-center mt-6">
        <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
        {' · '}
        <Link to="/terms" className="hover:underline">Terms of Service</Link>
        {' · '}
        <a href="mailto:support@justmailit.com" className="hover:underline">Contact support</a>
      </p>
    </div>
  )
}
