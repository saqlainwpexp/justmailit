import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, User, AlertCircle, CheckCircle, Loader2, Building2 } from 'lucide-react'

// ─── Password strength ────────────────────────────────────────────────────────

interface PasswordRule {
  label: string
  test: (p: string) => boolean
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'At least 8 characters',                 test: p => p.length >= 8 },
  { label: 'One uppercase letter (A–Z)',             test: p => /[A-Z]/.test(p) },
  { label: 'One lowercase letter (a–z)',             test: p => /[a-z]/.test(p) },
  { label: 'One number (0–9)',                       test: p => /\d/.test(p) },
  { label: 'One special character (!@#$%^&*)',       test: p => /[!@#$%^&*()\-_=+[\]{};:'"<>?,./\\|`~]/.test(p) },
]

function passwordStrength(p: string): { score: number; label: string; color: string; bar: string } {
  const passed = PASSWORD_RULES.filter(r => r.test(p)).length
  if (!p) return { score: 0, label: '', color: 'bg-gray-200', bar: 'w-0' }
  if (passed <= 1) return { score: 1, label: 'Weak',      color: 'bg-red-400',    bar: 'w-1/5' }
  if (passed === 2) return { score: 2, label: 'Fair',      color: 'bg-orange-400', bar: 'w-2/5' }
  if (passed === 3) return { score: 3, label: 'Good',      color: 'bg-yellow-400', bar: 'w-3/5' }
  if (passed === 4) return { score: 4, label: 'Strong',    color: 'bg-[#4a7c59]',  bar: 'w-4/5' }
  return               { score: 5, label: 'Very strong', color: 'bg-[#2d5a3d]',  bar: 'w-full' }
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

// ─── Google icon ──────────────────────────────────────────────────────────────

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

// ─── Video panel (left) ───────────────────────────────────────────────────────

function VideoPanel() {
  return (
    <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden bg-[#0a0f0a] shrink-0">
      <video
        className="absolute inset-0 w-full h-full object-cover opacity-45"
        autoPlay muted loop playsInline
      >
        <source src="/auth-bg.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-gradient-to-br from-[#0d1f0d]/90 via-[#1a2e1a]/70 to-[#0a150a]/90" />
      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")' }} />
      <div className="relative z-10 flex flex-col justify-between h-full p-10 w-full">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#4a7c59] flex items-center justify-center">
            <Mail className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">justmailit</span>
        </div>
        <div>
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            Your outreach<br />
            starts here.<br />
            <span className="text-[#7db88a]">Today.</span>
          </h2>
          <p className="text-white/60 text-sm leading-relaxed max-w-sm mb-8">
            Set up in minutes. Connect your email accounts, import your contacts, and send your first campaign before lunch.
          </p>
          {[
            'Free 14-day trial — no credit card required',
            'Unlimited contacts on all plans',
            'Cancel anytime, no questions asked',
          ].map(item => (
            <div key={item} className="flex items-center gap-2.5 mb-2.5">
              <div className="w-4 h-4 rounded-full bg-[#4a7c59]/30 border border-[#4a7c59] flex items-center justify-center shrink-0">
                <CheckCircle className="w-2.5 h-2.5 text-[#7db88a]" />
              </div>
              <p className="text-white/70 text-sm">{item}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: '5 min', label: 'Average setup time' },
            { value: '60%', label: 'Avg. open rate' },
            { value: '3×', label: 'Reply rate vs manual' },
          ].map(s => (
            <div key={s.label} className="bg-white/8 border border-white/10 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-white">{s.value}</p>
              <p className="text-[10px] text-white/50 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Success state ────────────────────────────────────────────────────────────

function SuccessScreen({ email }: { email: string }) {
  return (
    <div className="flex-1 flex flex-col justify-center items-center px-8 py-12 text-center">
      <div className="w-16 h-16 rounded-full bg-[#f0f7f2] flex items-center justify-center mb-5">
        <CheckCircle className="w-8 h-8 text-[#2d5a3d]" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Check your inbox</h2>
      <p className="text-sm text-gray-500 max-w-xs leading-relaxed mb-6">
        We sent a verification link to <span className="font-semibold text-gray-700">{email}</span>. Click the link to activate your account.
      </p>
      <div className="bg-[#f0f7f2] border border-[#c8e0cf] rounded-xl p-4 max-w-xs w-full text-left space-y-2">
        <p className="text-xs font-semibold text-[#2d5a3d]">Didn't get the email?</p>
        <p className="text-[11px] text-[#4a7c59]">Check your spam folder. The link expires in 24 hours.</p>
        <button className="text-[11px] font-semibold text-[#2d5a3d] hover:underline">Resend verification email</button>
      </div>
      <Link to="/signin" className="mt-6 text-xs font-semibold text-[#2d5a3d] hover:underline">
        ← Back to sign in
      </Link>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SignUp() {
  const [form, setForm] = useState({ name: '', company: '', email: '', password: '', confirm: '' })
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    setError('')
  }

  const strength = useMemo(() => passwordStrength(form.password), [form.password])
  const emailValid = validateEmail(form.email)
  const passwordOk = PASSWORD_RULES.every(r => r.test(form.password))
  const confirmOk = form.confirm === form.password && form.confirm.length > 0
  const canSubmit = form.name.trim() && emailValid && passwordOk && confirmOk && acceptTerms && !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: form.name.trim(), company: form.company.trim(), email: form.email.trim(), password: form.password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Registration failed.'); setLoading(false); return }
      // Show "check your inbox" screen
      setDone(true)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-white">
      <VideoPanel />

      {done ? (
        <SuccessScreen email={form.email} />
      ) : (
        <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 lg:px-16 py-12 overflow-y-auto">
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-[#2d5a3d] flex items-center justify-center">
              <Mail className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg text-[#1a3526] tracking-tight">justmailit</span>
          </div>

          <div className="max-w-sm w-full">
            <h1 className="text-2xl font-bold text-gray-900 mb-1.5">Create your account</h1>
            <p className="text-sm text-gray-500 mb-7">Start your 14-day free trial — no credit card needed</p>

            {/* Google OAuth */}
            <button type="button" className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm mb-5">
              <GoogleIcon />
              Sign up with Google
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium">or with email</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
              <input type="hidden" name="_csrf" value="csrf_token_placeholder" />

              {/* Name + Company */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Full name <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="text"
                      autoComplete="name"
                      value={form.name}
                      onChange={set('name')}
                      placeholder="Alex Johnson"
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d] hover:border-gray-300 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Company</label>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="text"
                      autoComplete="organization"
                      value={form.company}
                      onChange={set('company')}
                      placeholder="Acme Inc."
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d] hover:border-gray-300 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email address <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={set('email')}
                    placeholder="you@yourdomain.com"
                    className={`w-full pl-9 pr-4 py-2.5 text-sm border rounded-xl bg-white outline-none transition-all
                      focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d]
                      ${form.email && !emailValid ? 'border-red-300 bg-red-50/30' : 'border-gray-200 hover:border-gray-300'}`}
                  />
                </div>
                {form.email && !emailValid && <p className="text-[11px] text-red-500 mt-1">Enter a valid email address</p>}
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Password <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={set('password')}
                    placeholder="Create a strong password"
                    className="w-full pl-9 pr-10 py-2.5 text-sm border border-gray-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d] hover:border-gray-300 transition-all"
                  />
                  <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Strength bar */}
                {form.password && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex gap-1 flex-1 mr-2">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strength.score ? strength.color : 'bg-gray-200'}`} />
                        ))}
                      </div>
                      <span className={`text-[10px] font-semibold ${strength.score <= 2 ? 'text-red-500' : strength.score <= 3 ? 'text-yellow-600' : 'text-[#2d5a3d]'}`}>
                        {strength.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                      {PASSWORD_RULES.map(r => (
                        <div key={r.label} className="flex items-center gap-1">
                          {r.test(form.password)
                            ? <CheckCircle className="w-2.5 h-2.5 text-[#2d5a3d] shrink-0" />
                            : <div className="w-2.5 h-2.5 rounded-full border border-gray-300 shrink-0" />}
                          <span className={`text-[10px] ${r.test(form.password) ? 'text-[#2d5a3d]' : 'text-gray-400'}`}>{r.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Confirm password <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={form.confirm}
                    onChange={set('confirm')}
                    placeholder="Repeat your password"
                    className={`w-full pl-9 pr-10 py-2.5 text-sm border rounded-xl bg-white outline-none transition-all
                      focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d]
                      ${form.confirm && !confirmOk ? 'border-red-300 bg-red-50/30' : 'border-gray-200 hover:border-gray-300'}`}
                  />
                  <button type="button" onClick={() => setShowConfirm(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {form.confirm && !confirmOk && <p className="text-[11px] text-red-500 mt-1">Passwords do not match</p>}
                {confirmOk && <p className="text-[11px] text-[#2d5a3d] mt-1 flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" /> Passwords match</p>}
              </div>

              {/* Terms */}
              <div className="flex items-start gap-2.5">
                <button
                  type="button"
                  onClick={() => setAcceptTerms(p => !p)}
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0 mt-0.5
                    ${acceptTerms ? 'bg-[#2d5a3d] border-[#2d5a3d]' : 'border-gray-300 hover:border-[#2d5a3d]'}`}
                >
                  {acceptTerms && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
                <span className="text-xs text-gray-600 leading-relaxed">
                  I agree to the{' '}
                  <Link to="/terms" className="font-semibold text-[#2d5a3d] hover:underline">Terms of Service</Link>
                  {' '}and{' '}
                  <Link to="/privacy" className="font-semibold text-[#2d5a3d] hover:underline">Privacy Policy</Link>
                </span>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl p-3">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d5a3d] hover:bg-[#245030] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all shadow-sm"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Creating account…</> : 'Create free account'}
              </button>
            </form>

            <p className="text-xs text-gray-500 text-center mt-5">
              Already have an account?{' '}
              <Link to="/signin" className="font-semibold text-[#2d5a3d] hover:underline">Sign in</Link>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
