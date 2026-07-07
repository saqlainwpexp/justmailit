import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

function validateEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

function VideoPanel() {
  return (
    <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[#0a0f0a] shrink-0">
      <video className="absolute inset-0 w-full h-full object-cover opacity-50" autoPlay muted loop playsInline>
        <source src="/auth-bg.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-gradient-to-br from-[#0d1f0d]/90 via-[#1a2e1a]/70 to-[#0a0f0a]/90" />
      <div className="relative z-10 flex flex-col justify-between h-full p-10 w-full">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#4a7c59] flex items-center justify-center">
            <Mail className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">justmailit</span>
        </div>
        <div>
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            Send smarter.<br />Close faster.<br />
            <span className="text-[#7db88a]">Scale effortlessly.</span>
          </h2>
          <p className="text-white/60 text-base leading-relaxed max-w-sm">
            The cold email platform built for serious outreach teams. Automate sequences, track every reply, and land in the inbox.
          </p>
          <div className="grid grid-cols-3 gap-4 mt-8">
            {[{ value: '12k+', label: 'Active teams' }, { value: '98%', label: 'Deliverability' }, { value: '4.2M', label: 'Emails/mo' }].map(s => (
              <div key={s.label}>
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-white/50 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white/8 backdrop-blur-sm border border-white/10 rounded-2xl p-5">
          <p className="text-white/80 text-sm leading-relaxed italic mb-3">
            "Emailit cut our outreach setup time in half. We went from 200 to 2,000 personalised emails a day."
          </p>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#4a7c59] flex items-center justify-center text-white text-xs font-bold">JK</div>
            <div>
              <p className="text-white text-xs font-semibold">James K.</p>
              <p className="text-white/50 text-[11px]">Head of Growth, TechScale</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SignIn() {
  const { user, signIn } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const fromLoc   = (location.state as { from?: { pathname: string; search?: string } })?.from
  const from      = fromLoc ? `${fromLoc.pathname}${fromLoc.search || ''}` : '/'

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [errorCode,setErrorCode]= useState('')
  const [locked,   setLocked]   = useState<number | null>(null) // mins
  const [resendSent, setResendSent] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)

  // Already logged in → redirect
  useEffect(() => { if (user) navigate(from, { replace: true }) }, [user, from, navigate])

  const emailValid = validateEmail(email)
  const isLocked   = locked !== null && locked > 0
  const canSubmit  = emailValid && password.length >= 1 && !loading && !isLocked

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError('')
    setErrorCode('')
    setLocked(null)
    setResendSent(false)

    const result = await signIn(email.trim(), password)
    setLoading(false)

    if (result.error) {
      setError(result.error)
      setErrorCode(result.code || '')
      if (result.lockedMins) setLocked(result.lockedMins)
    } else {
      navigate(from, { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left — form */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-20 py-12">
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-8 h-8 rounded-lg bg-[#2d5a3d] flex items-center justify-center">
            <Mail className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg text-[#1a3526] tracking-tight">justmailit</span>
        </div>

        <div className="max-w-sm w-full">
          <h1 className="text-2xl font-bold text-gray-900 mb-1.5">Welcome back</h1>
          <p className="text-sm text-gray-500 mb-8">Sign in to your Justmailit account</p>

          {isLocked && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-700">Account temporarily locked</p>
                <p className="text-xs text-red-600 mt-0.5">Too many failed attempts. Try again in {locked} minute{locked !== 1 ? 's' : ''}.</p>
              </div>
            </div>
          )}

          {/* Google OAuth (UI only — wire up when you add OAuth provider) */}
          <button
            type="button"
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm mb-6"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">or sign in with email</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Email */}
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
                  disabled={isLocked}
                  className={`w-full pl-10 pr-4 py-2.5 text-sm border rounded-xl bg-white outline-none transition-all
                    focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d]
                    ${email && !emailValid ? 'border-red-300 bg-red-50/30' : 'border-gray-200 hover:border-gray-300'}
                    disabled:opacity-50 disabled:cursor-not-allowed`}
                />
              </div>
              {email && !emailValid && <p className="text-[11px] text-red-500 mt-1">Enter a valid email address</p>}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-700">Password</label>
                <Link to="/forgot-password" className="text-xs font-medium text-[#2d5a3d] hover:underline">Forgot password?</Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  placeholder="••••••••"
                  disabled={isLocked}
                  className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d] hover:border-gray-300 transition-all disabled:opacity-50"
                />
                <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setRemember(p => !p)}
                className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0
                  ${remember ? 'bg-[#2d5a3d] border-[#2d5a3d]' : 'border-gray-300 hover:border-[#2d5a3d]'}`}
              >
                {remember && (
                  <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
              <span className="text-xs text-gray-600">Remember me for 30 days</span>
            </div>

            {/* Error — unverified email gets its own resend UI */}
            {error && errorCode === 'EMAIL_NOT_VERIFIED' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">{error}</p>
                </div>
                {!resendSent ? (
                  <button
                    type="button"
                    disabled={resendLoading}
                    onClick={async () => {
                      setResendLoading(true)
                      await fetch('/api/auth/resend-verification', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: email.trim() }),
                      })
                      setResendLoading(false)
                      setResendSent(true)
                    }}
                    className="text-xs font-semibold text-amber-700 hover:underline disabled:opacity-50"
                  >
                    {resendLoading ? 'Sending…' : '→ Resend verification email'}
                  </button>
                ) : (
                  <p className="text-xs font-semibold text-[#2d5a3d]">✓ New link sent — check your inbox.</p>
                )}
              </div>
            )}
            {error && errorCode !== 'EMAIL_NOT_VERIFIED' && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl p-3">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d5a3d] hover:bg-[#245030] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all shadow-sm mt-2"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Signing in…</> : 'Sign in'}
            </button>
          </form>

          <p className="text-xs text-gray-500 text-center mt-6">
            Don't have an account?{' '}
            <Link to="/signup" className="font-semibold text-[#2d5a3d] hover:underline">Create one free</Link>
          </p>

          <p className="text-[10px] text-gray-400 text-center mt-4 leading-relaxed">
            Protected by rate limiting · CSRF protection · httpOnly JWT cookies
          </p>
        </div>
      </div>

      {/* Right — video */}
      <VideoPanel />
    </div>
  )
}
