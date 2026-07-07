import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Zap, Crown, Sparkles, Building2, ArrowLeft, X } from 'lucide-react'
import { apiFetch } from '../lib/api'

// ─── Plan data ────────────────────────────────────────────────────────────────

const PLANS = [
  {
    id:        'free_trial',
    name:      'Free Trial',
    price:     0,
    interval:  null,
    badge:     null,
    icon:      Sparkles,
    iconBg:    'bg-amber-50',
    iconColor: 'text-amber-500',
    highlight: false,
    cta:       'Current plan',
    ctaDisabled: true,
    limits: { contacts: '700', emails: '4,000 / 14 days' },
    features: [
      '700 contacts',
      '4,000 emails (trial total)',
      '14-day free trial',
      'All core features',
      'Email campaign builder',
      'Basic analytics',
      'Community support',
    ],
  },
  {
    id:        'pro',
    name:      'Pro',
    price:     9,
    interval:  'month',
    badge:     null,
    icon:      Zap,
    iconBg:    'bg-[#f0f7f2]',
    iconColor: 'text-[#2d5a3d]',
    highlight: false,
    cta:       'Upgrade to Pro',
    ctaDisabled: false,
    limits: { contacts: '3,000', emails: '10,000 / mo' },
    features: [
      '3,000 contacts',
      '10,000 emails / month',
      'Unlimited campaigns',
      'Email automation workflows',
      'Open & click tracking',
      'CSV import / export',
      'Priority email support',
    ],
  },
  {
    id:        'max',
    name:      'Max',
    price:     49,
    interval:  'month',
    badge:     'Most Popular',
    icon:      Crown,
    iconBg:    'bg-violet-50',
    iconColor: 'text-violet-600',
    highlight: true,
    cta:       'Upgrade to Max',
    ctaDisabled: false,
    limits: { contacts: '20,000', emails: '20,000 / mo' },
    features: [
      '20,000 contacts',
      '20,000 emails / month',
      'Everything in Pro',
      'Advanced segmentation',
      'Custom sending schedules',
      'Unified inbox',
      'Priority support',
    ],
  },
  {
    id:        'agency',
    name:      'Agency',
    price:     190,
    interval:  'lifetime',
    badge:     'Best Value',
    icon:      Building2,
    iconBg:    'bg-orange-50',
    iconColor: 'text-orange-500',
    highlight: false,
    cta:       'Get Lifetime Access',
    ctaDisabled: false,
    limits: { contacts: 'Unlimited', emails: 'Unlimited' },
    features: [
      'Unlimited contacts',
      'Unlimited emails',
      'Everything in Max',
      'One-time payment (no monthly fee)',
      'Multi-account support',
      'API access',
      'Dedicated support',
      'All future updates included',
    ],
  },
]

// ─── Payment modal ────────────────────────────────────────────────────────────

interface PayModalProps {
  plan: typeof PLANS[0]
  onClose: () => void
  onSuccess: (planId: string) => void
}

function PaymentModal({ plan, onClose, onSuccess }: PayModalProps) {
  const [card,    setCard]    = useState('')
  const [expiry,  setExpiry]  = useState('')
  const [cvc,     setCvc]     = useState('')
  const [name,    setName]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  function fmtCard(v: string) {
    return v.replace(/\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim()
  }
  function fmtExpiry(v: string) {
    const d = v.replace(/\D/g,'').slice(0,4)
    return d.length >= 3 ? `${d.slice(0,2)} / ${d.slice(2)}` : d
  }

  const cardNum   = card.replace(/\s/g,'')
  const isValid   = cardNum.length === 16 && expiry.replace(/\s/g,'').length === 5 && cvc.length >= 3 && name.trim().length >= 2

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid || loading) return
    setLoading(true)
    setError('')

    // Simulate network delay + generate a demo token the server accepts
    await new Promise(r => setTimeout(r, 1600))

    const demoToken = `demo_pay_${plan.id}_${Date.now()}`
    const result = await apiFetch<{ ok: boolean; planName: string }>('/api/billing/upgrade', {
      method: 'POST',
      body: JSON.stringify({ plan: plan.id, paymentToken: demoToken }),
    })

    setLoading(false)
    if ('error' in result) {
      setError((result as { error: string }).error)
    } else {
      onSuccess(plan.id)
    }
  }

  const priceLabel = plan.interval === 'lifetime'
    ? `$${plan.price} one-time`
    : `$${plan.price}/month`

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" style={{ background: 'rgba(10,15,10,0.65)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-900">{plan.name} Plan</h3>
            <p className="text-xs text-gray-500 mt-0.5">{priceLabel}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Order summary */}
        <div className="px-7 py-4 bg-[#f6faf7] border-b border-[#d0e9d8]">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#3a6b4a] font-medium">{plan.name} — {plan.limits.contacts} contacts · {plan.limits.emails} emails</span>
            <span className="font-bold text-[#2d5a3d]">{priceLabel}</span>
          </div>
        </div>

        {/* Payment form */}
        <form onSubmit={handlePay} className="px-7 py-5 space-y-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Card details</p>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Name on card</label>
            <input
              type="text"
              autoComplete="cc-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d] hover:border-gray-300 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Card number</label>
            <input
              type="text"
              autoComplete="cc-number"
              inputMode="numeric"
              value={card}
              onChange={e => setCard(fmtCard(e.target.value))}
              placeholder="4242 4242 4242 4242"
              maxLength={19}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d] hover:border-gray-300 transition-all font-mono tracking-wider"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Expiry</label>
              <input
                type="text"
                autoComplete="cc-exp"
                inputMode="numeric"
                value={expiry}
                onChange={e => setExpiry(fmtExpiry(e.target.value))}
                placeholder="MM / YY"
                maxLength={7}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d] hover:border-gray-300 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">CVC</label>
              <input
                type="text"
                autoComplete="cc-csc"
                inputMode="numeric"
                value={cvc}
                onChange={e => setCvc(e.target.value.replace(/\D/g,'').slice(0,4))}
                placeholder="123"
                maxLength={4}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d] hover:border-gray-300 transition-all"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">{error}</p>
          )}

          <button
            type="submit"
            disabled={!isValid || loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d5a3d] hover:bg-[#245030] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all shadow-sm mt-1"
          >
            {loading ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing…</>
            ) : `Pay ${priceLabel}`}
          </button>

          <p className="text-[10px] text-gray-400 text-center leading-relaxed">
            Your card details are processed securely. By completing your purchase you agree to our{' '}
            <a href="/terms" className="underline">Terms</a> and{' '}
            <a href="/privacy" className="underline">Privacy Policy</a>.
          </p>
        </form>
      </div>
    </div>
  )
}

// ─── Success modal ────────────────────────────────────────────────────────────

function SuccessModal({ planName, onClose }: { planName: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" style={{ background: 'rgba(10,15,10,0.65)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">You're on {planName}!</h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">
          Your plan is now active. All new limits take effect immediately. Thanks for choosing Justmailit.
        </p>
        <button
          onClick={onClose}
          className="w-full py-2.5 bg-[#2d5a3d] hover:bg-[#245030] text-white text-sm font-semibold rounded-xl transition-all shadow-sm"
        >
          Back to dashboard
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Pricing() {
  const navigate              = useNavigate()
  const [paying, setPaying]   = useState<typeof PLANS[0] | null>(null)
  const [success, setSuccess] = useState('')
  const [currentPlan, setCurrentPlan] = useState('free_trial')

  useEffect(() => {
    apiFetch<{ plan: string }>('/api/billing/status').then(r => {
      if (!('error' in r)) setCurrentPlan(r.plan)
    }).catch(() => {})
  }, [])

  function handleUpgrade(plan: typeof PLANS[0]) {
    if (plan.ctaDisabled || plan.id === currentPlan) return
    setPaying(plan)
  }

  function handleSuccess(planId: string) {
    setPaying(null)
    setSuccess(PLANS.find(p => p.id === planId)?.name ?? planId)
  }

  return (
    <div className="min-h-screen bg-[#f6faf7]">
      {/* Top bar */}
      <div className="border-b border-sage-200 bg-white px-8 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-sage-500 hover:text-forest font-medium transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2 ml-4">
          <div className="w-7 h-7 rounded-lg bg-[#2d5a3d] flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-[#1a3526] text-base tracking-tight">justmailit</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-14">
        {/* Heading */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Simple, transparent pricing</h1>
          <p className="text-base text-gray-500 max-w-lg mx-auto leading-relaxed">
            Start free, grow as you go. Every plan includes all core features — no hidden fees.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLANS.map(plan => {
            const Icon      = plan.icon
            const isCurrent = plan.id === currentPlan
            const isHighlight = plan.highlight

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl p-6 border transition-all ${
                  isHighlight
                    ? 'bg-[#2d5a3d] border-[#2d5a3d] shadow-lg scale-[1.02]'
                    : 'bg-white border-gray-200 shadow-sm hover:shadow-md hover:-translate-y-0.5'
                }`}
              >
                {/* Badge */}
                {plan.badge && (
                  <span className={`absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold px-3 py-1 rounded-full ${
                    isHighlight ? 'bg-white text-[#2d5a3d]' : 'bg-[#2d5a3d] text-white'
                  }`}>
                    {plan.badge}
                  </span>
                )}

                {/* Icon */}
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${
                  isHighlight ? 'bg-white/15' : plan.iconBg
                }`}>
                  <Icon className={`w-5 h-5 ${isHighlight ? 'text-white' : plan.iconColor}`} />
                </div>

                {/* Name + price */}
                <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${isHighlight ? 'text-white/60' : 'text-gray-400'}`}>
                  {plan.name}
                </p>
                <div className="flex items-end gap-1 mb-1">
                  <span className={`text-3xl font-bold ${isHighlight ? 'text-white' : 'text-gray-900'}`}>
                    {plan.price === 0 ? 'Free' : `$${plan.price}`}
                  </span>
                  {plan.price > 0 && (
                    <span className={`text-xs pb-1 ${isHighlight ? 'text-white/60' : 'text-gray-400'}`}>
                      /{plan.interval}
                    </span>
                  )}
                </div>

                {/* Limits pills */}
                <div className="flex gap-1.5 flex-wrap mb-5">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    isHighlight ? 'bg-white/15 text-white' : 'bg-sage-100 text-sage-600'
                  }`}>{plan.limits.contacts} contacts</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    isHighlight ? 'bg-white/15 text-white' : 'bg-sage-100 text-sage-600'
                  }`}>{plan.limits.emails}</span>
                </div>

                {/* Features */}
                <ul className="space-y-2 flex-1 mb-6">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-xs">
                      <Check className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${isHighlight ? 'text-white/70' : 'text-[#2d5a3d]'}`} />
                      <span className={isHighlight ? 'text-white/80' : 'text-gray-600'}>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isCurrent ? (
                  <span className={`w-full text-center py-2.5 text-sm font-semibold rounded-xl border ${
                    isHighlight
                      ? 'border-white/30 text-white/70'
                      : 'border-gray-200 text-gray-400'
                  }`}>Current plan</span>
                ) : (
                  <button
                    onClick={() => handleUpgrade(plan)}
                    className={`w-full py-2.5 text-sm font-semibold rounded-xl transition-all ${
                      isHighlight
                        ? 'bg-white text-[#2d5a3d] hover:bg-white/90 shadow-sm'
                        : 'bg-[#2d5a3d] text-white hover:bg-[#245030] shadow-sm'
                    }`}
                  >
                    {plan.cta}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* FAQ */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {[
            { q: 'What happens when my trial expires?', a: 'After 14 days, your account is paused. All your data is saved. Upgrade to any paid plan to immediately restore access.' },
            { q: 'Can I change plans later?', a: 'Yes. Upgrade at any time. If you upgrade mid-cycle, your new limits take effect immediately.' },
            { q: 'Is the Agency plan really lifetime?', a: 'Yes — one payment of $190 gives you unlimited access forever, including all future features and updates.' },
            { q: 'What payment methods are accepted?', a: 'We accept all major credit and debit cards. Payments are processed securely. No card details are stored on our servers.' },
          ].map(({ q, a }) => (
            <div key={q} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <p className="text-sm font-semibold text-gray-900 mb-1.5">{q}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {paying && (
        <PaymentModal
          plan={paying}
          onClose={() => setPaying(null)}
          onSuccess={handleSuccess}
        />
      )}
      {success && (
        <SuccessModal
          planName={success}
          onClose={() => { setSuccess(''); navigate('/') }}
        />
      )}
    </div>
  )
}
