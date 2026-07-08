import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, Mail, Globe, Users, FileText, Send, Zap, CheckCircle, Sparkles,
  ChevronRight, ChevronLeft, ArrowRight,
} from 'lucide-react'

const STORAGE_KEY = 'jm_onboarding_v1'

interface Step {
  icon: React.ElementType
  iconBg: string
  iconColor: string
  badge: string
  title: string
  description: string
  tip?: string
  route?: string
  ctaLabel: string
  skipLabel?: string
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
    badge: 'Welcome',
    title: 'Welcome to KeepMailing!',
    description:
      "You're all set up. Let's take a quick tour so you can send emails that actually get opened — and replied to.",
    ctaLabel: "Let's get started",
  },
  {
    icon: Mail,
    iconBg: 'bg-[#f0f7f2]',
    iconColor: 'text-[#2d5a3d]',
    badge: 'Step 1 of 6',
    title: 'Connect your email account',
    description:
      'Add your SMTP credentials to start sending. Works with Gmail, Outlook, Zoho, or any custom SMTP server.',
    tip: "Gmail users: generate an App Password in your Google account security settings — your regular password won't work with SMTP.",
    route: '/accounts',
    ctaLabel: 'Connect email',
    skipLabel: "I'll do this later",
  },
  {
    icon: Globe,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    badge: 'Step 2 of 6',
    title: 'Verify your sending domain',
    description:
      'Set up SPF, DKIM, and DMARC DNS records to protect your sender reputation and land in inboxes — not spam.',
    tip: 'DNS changes propagate in 5 min to 24 hours. Add the records now and the domain checker will confirm when they go live.',
    route: '/domains',
    ctaLabel: 'Set up domain',
    skipLabel: "I'll do this later",
  },
  {
    icon: Users,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    badge: 'Step 3 of 6',
    title: 'Build your contact list',
    description:
      'Import contacts from a CSV file or add them one by one. Tag and segment your audience to target the right people with the right message.',
    tip: 'CSV columns: email, first_name, last_name, company, phone, tags. Tags let you create precise segments per campaign.',
    route: '/contacts',
    ctaLabel: 'Import contacts',
    skipLabel: "I'll do this later",
  },
  {
    icon: FileText,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    badge: 'Step 4 of 6',
    title: 'Create a reusable template',
    description:
      'Build email templates once, reuse them across campaigns. Use merge tags like {{first_name}} and {{company}} to personalise at scale.',
    tip: 'Great templates have one clear goal, a punchy subject line, and a single call to action. Less is more.',
    route: '/templates',
    ctaLabel: 'Create template',
    skipLabel: "I'll do this later",
  },
  {
    icon: Send,
    iconBg: 'bg-[#f0f7f2]',
    iconColor: 'text-[#2d5a3d]',
    badge: 'Step 5 of 6',
    title: 'Launch your first campaign',
    description:
      'Write your email, choose your audience, and hit send — or schedule it for the perfect time in your prospect\'s timezone.',
    tip: 'Start at 50–100 emails/day per account while warming up. Ramp gradually over 2–3 weeks for best deliverability.',
    route: '/campaigns',
    ctaLabel: 'Create campaign',
    skipLabel: "I'll do this later",
  },
  {
    icon: Zap,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    badge: 'Step 6 of 6',
    title: 'Automate your outreach',
    description:
      'Build email sequences that run on autopilot — welcome series, follow-ups, re-engagement flows — while you focus on closing.',
    tip: 'A 3-step sequence (Day 1 intro → Day 3 value add → Day 7 follow-up) consistently outperforms single sends.',
    route: '/automation',
    ctaLabel: 'Build a workflow',
    skipLabel: "I'll do this later",
  },
  {
    icon: CheckCircle,
    iconBg: 'bg-green-50',
    iconColor: 'text-green-600',
    badge: 'All done!',
    title: "You're ready to grow!",
    description:
      "Your KeepMailing workspace is set up. Head to the dashboard to see your stats, manage campaigns, and track every reply.",
    ctaLabel: 'Go to dashboard',
  },
]

export default function OnboardingModal() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== 'done' } catch { return true }
  })
  const navigate = useNavigate()

  if (!visible) return null

  const current = STEPS[step]
  const isFirst = step === 0
  const isLast  = step === STEPS.length - 1
  const Icon    = current.icon
  const pct     = Math.round(((step + 1) / STEPS.length) * 100)

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, 'done') } catch {}
    setVisible(false)
  }

  function next() {
    if (isLast) { dismiss(); navigate('/') }
    else setStep(s => s + 1)
  }

  function goToFeature() {
    dismiss()
    if (current.route) navigate(current.route)
  }

  return (
    <>
      <style>{`
        @keyframes jm-slide-up {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        .jm-onboard-card { animation: jm-slide-up 0.28s cubic-bezier(.22,.68,0,1.2) both; }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ background: 'rgba(10,15,10,0.6)', backdropFilter: 'blur(6px)' }}
        onClick={(e) => { if (e.target === e.currentTarget) dismiss() }}
      >
        <div className="jm-onboard-card bg-white rounded-2xl shadow-2xl w-full max-w-[500px] overflow-hidden">

          {/* Progress bar */}
          <div className="h-[3px] bg-gray-100">
            <div
              className="h-full bg-[#2d5a3d] transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Badge + close */}
          <div className="flex items-center justify-between px-7 pt-5 pb-0">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500 tracking-wide uppercase">
              {current.badge}
            </span>
            <button
              onClick={dismiss}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Skip tour"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-7 pt-5 pb-3 text-center">
            {/* Icon */}
            <div className={`w-[76px] h-[76px] rounded-2xl ${current.iconBg} flex items-center justify-center mx-auto mb-5 shadow-sm`}>
              <Icon className={`w-9 h-9 ${current.iconColor}`} />
            </div>

            <h2 className="text-[22px] font-bold text-gray-900 leading-snug mb-2.5">
              {current.title}
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed max-w-[380px] mx-auto">
              {current.description}
            </p>

            {/* Tip */}
            {current.tip && (
              <div className="mt-5 bg-[#f6faf7] border border-[#c8e6d0] rounded-xl px-4 py-3 text-left">
                <p className="text-[12px] text-[#3a6b4a] leading-relaxed">
                  <span className="font-semibold text-[#2d5a3d]">Tip · </span>
                  {current.tip}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-7 pb-7 pt-3">
            {/* Primary CTA */}
            {current.route ? (
              <div className="flex flex-col gap-2">
                <button
                  onClick={goToFeature}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d5a3d] hover:bg-[#245030] text-white text-sm font-semibold rounded-xl transition-all shadow-sm"
                >
                  {current.ctaLabel}
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={next}
                  className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 font-medium transition-colors"
                >
                  {current.skipLabel ?? "Skip for now"}
                </button>
              </div>
            ) : (
              <button
                onClick={next}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d5a3d] hover:bg-[#245030] text-white text-sm font-semibold rounded-xl transition-all shadow-sm"
              >
                {current.ctaLabel}
                {!isLast && <ChevronRight className="w-4 h-4" />}
              </button>
            )}

            {/* Dot nav + back + skip tour */}
            <div className="flex items-center justify-between mt-5">
              {/* Dots — clickable */}
              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`rounded-full transition-all duration-300 ${
                      i === step
                        ? 'w-5 h-[5px] bg-[#2d5a3d]'
                        : i < step
                        ? 'w-[5px] h-[5px] bg-[#2d5a3d]/30'
                        : 'w-[5px] h-[5px] bg-gray-200'
                    }`}
                    aria-label={`Go to step ${i + 1}`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-4">
                {!isFirst && (
                  <button
                    onClick={() => setStep(s => s - 1)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                )}
                {isFirst && (
                  <button
                    onClick={dismiss}
                    className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors"
                  >
                    Skip tour
                  </button>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
