import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, CheckCircle, Mail, Users, Calendar,
  Send, Eye, Clock, AlertCircle, Zap, ChevronDown, Loader2, XCircle, FlaskConical,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useData, apiFetch } from '../../lib/api'
import EmailEditor from './components/EmailEditor'
import EmailPreview from './components/EmailPreview'
import RecipientSelector from './components/RecipientSelector'

const STEPS = [
  { id: 1, label: 'Details', icon: Mail },
  { id: 2, label: 'Email', icon: Zap },
  { id: 3, label: 'Recipients', icon: Users },
  { id: 4, label: 'Schedule', icon: Calendar },
  { id: 5, label: 'Review', icon: Send },
]

interface Account {
  id: number
  name: string
  email: string
  fromName: string
  status: string
}

interface ContactMini {
  id: number
  firstName: string
  lastName: string
  email: string
  tags: string[]
  status: string
}

interface AbVariant {
  subject: string
  previewText: string
  bodyHtml: string
}

interface AbTestConfig {
  enabled: boolean
  variants: [AbVariant, AbVariant]
  testPercent: number
  winnerMetric: 'openRate' | 'clickRate'
  testDurationHours: number
}

interface Campaign {
  name: string
  fromAccountId: number
  replyTo: string
  trackOpens: boolean
  trackClicks: boolean
  subject: string
  previewText: string
  bodyHtml: string
  abTest: AbTestConfig
  recipients: { type: 'all' | 'tags' | 'specific' | 'segment'; tags: string[]; contactIds: number[]; segmentId: number | null }
  scheduleType: 'now' | 'scheduled'
  scheduledAt: string
}

const DEFAULT: Campaign = {
  name: '',
  fromAccountId: 0,
  replyTo: '',
  trackOpens: true,
  trackClicks: true,
  subject: '',
  previewText: '',
  bodyHtml: '',
  abTest: {
    enabled: false,
    variants: [
      { subject: '', previewText: '', bodyHtml: '' },
      { subject: '', previewText: '', bodyHtml: '' },
    ],
    testPercent: 20,
    winnerMetric: 'openRate',
    testDurationHours: 4,
  },
  recipients: { type: 'all', tags: [], contactIds: [], segmentId: null },
  scheduleType: 'now',
  scheduledAt: '',
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, i) => {
        const done = current > step.id
        const active = current === step.id
        return (
          <div key={step.id} className="flex items-center">
            <div className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all',
              active ? 'bg-forest text-white' : done ? 'text-green-700 bg-green-50' : 'text-sage-400'
            )}>
              {done
                ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                : <step.icon className="w-3.5 h-3.5 shrink-0" />
              }
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('w-6 h-px mx-1', done ? 'bg-green-300' : 'bg-sage-200')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button
        type="button"
        onClick={onChange}
        className={cn('relative w-9 h-5 rounded-full transition-colors shrink-0', checked ? 'bg-forest' : 'bg-sage-200')}
      >
        <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
      </button>
      <span className="text-sm text-sage-700">{label}</span>
    </label>
  )
}

// ── Step 1: Details ────────────────────────────────────────────────────────────
function StepDetails({
  c, set, accounts, accountsLoading,
}: {
  c: Campaign
  set: (k: keyof Campaign, v: any) => void
  accounts: Account[]
  accountsLoading: boolean
}) {
  const selectedAccount = accounts.find(a => a.id === c.fromAccountId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-forest">Campaign details</h2>
        <p className="text-sm text-sage-400 mt-0.5">Basic setup for your campaign</p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="label">Campaign name <span className="text-red-400">*</span></label>
          <input
            className="input"
            placeholder="e.g. June Newsletter, Cold Outreach Batch #8"
            value={c.name}
            onChange={e => set('name', e.target.value)}
          />
          <p className="text-xs text-sage-400 mt-1.5">Internal name — recipients won't see this</p>
        </div>

        <div>
          <label className="label">From account <span className="text-red-400">*</span></label>
          {accountsLoading ? (
            <div className="input flex items-center gap-2 text-sage-400">
              <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Loading accounts…</span>
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
              No email accounts configured. Go to <a href="/accounts" className="font-semibold underline ml-0.5">Email Accounts</a> to add one first.
            </div>
          ) : (
            <>
              <div className="relative">
                <select
                  className="input appearance-none pr-9"
                  value={c.fromAccountId}
                  onChange={e => set('fromAccountId', parseInt(e.target.value))}
                >
                  {c.fromAccountId === 0 && <option value={0} disabled>Select an account…</option>}
                  {accounts.map(a => (
                    <option key={a.id} value={a.id} disabled={a.status !== 'connected'}>
                      {a.email}{a.status !== 'connected' ? ` (${a.status})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sage-400 pointer-events-none" />
              </div>
              {selectedAccount && selectedAccount.status !== 'connected' && (
                <p className="flex items-center gap-1.5 text-xs text-red-600 mt-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  This account has a connection error — fix it in Email Accounts before sending.
                </p>
              )}
            </>
          )}
        </div>

        <div>
          <label className="label">Reply-to email <span className="text-sage-400 font-normal">(optional)</span></label>
          <input
            className="input"
            type="email"
            placeholder="replies@yourdomain.com"
            value={c.replyTo}
            onChange={e => set('replyTo', e.target.value)}
          />
          <p className="text-xs text-sage-400 mt-1.5">Leave blank to use the from address</p>
        </div>

        <div className="divider" />
        <div className="space-y-3">
          <p className="text-xs font-semibold text-sage-500 uppercase tracking-wider">Tracking</p>
          <Toggle checked={c.trackOpens} onChange={() => set('trackOpens', !c.trackOpens)} label="Track email opens" />
          <Toggle checked={c.trackClicks} onChange={() => set('trackClicks', !c.trackClicks)} label="Track link clicks" />
        </div>
      </div>
    </div>
  )
}

// ── Step 2: Email ──────────────────────────────────────────────────────────────
function SubjectPreviewBodyFields({
  subject, previewText, bodyHtml, onSubject, onPreviewText, onBodyHtml,
}: {
  subject: string; previewText: string; bodyHtml: string
  onSubject: (v: string) => void; onPreviewText: (v: string) => void; onBodyHtml: (v: string) => void
}) {
  const subjectLen = subject.length
  const subjectColor = subjectLen > 70 ? 'text-red-500' : subjectLen > 50 ? 'text-amber-500' : 'text-sage-400'
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Subject line <span className="text-red-400">*</span></label>
          <input
            className="input"
            placeholder="Your email subject — make it count!"
            value={subject}
            onChange={e => onSubject(e.target.value)}
          />
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-xs text-sage-400">Use merge tags like {'{{first_name}}'} for personalisation</p>
            <span className={cn('text-xs font-medium', subjectColor)}>{subjectLen}/70</span>
          </div>
        </div>
        <div>
          <label className="label">Preview text <span className="text-sage-400 font-normal">(optional)</span></label>
          <input
            className="input"
            placeholder="Short snippet shown below subject in inbox..."
            value={previewText}
            onChange={e => onPreviewText(e.target.value)}
            maxLength={120}
          />
          <p className="text-xs text-sage-400 mt-1.5">{previewText.length}/120 · shown below subject in inbox</p>
        </div>
      </div>
      <div>
        <label className="label">Email body <span className="text-red-400">*</span></label>
        <EmailEditor value={bodyHtml} onChange={onBodyHtml} />
      </div>
    </div>
  )
}

function StepEmail({ c, set, onPreview }: { c: Campaign; set: (k: keyof Campaign, v: any) => void; onPreview: () => void }) {
  const [variantTab, setVariantTab] = useState<0 | 1>(0)
  const ab = c.abTest

  const setVariant = (idx: 0 | 1, patch: Partial<AbVariant>) => {
    const variants: [AbVariant, AbVariant] = [...ab.variants] as [AbVariant, AbVariant]
    variants[idx] = { ...variants[idx], ...patch }
    set('abTest', { ...ab, variants })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-forest">Email content</h2>
          <p className="text-sm text-sage-400 mt-0.5">Write your subject line and email body</p>
        </div>
        {!ab.enabled && (
          <button type="button" onClick={onPreview} className="btn-secondary text-xs">
            <Eye className="w-4 h-4" />
            Preview email
          </button>
        )}
      </div>

      <div className="card !bg-sage-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', ab.enabled ? 'bg-forest text-white' : 'bg-sage-200 text-sage-500')}>
            <FlaskConical className="w-4.5 h-4.5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-sage-800">A/B test this campaign</p>
            <p className="text-xs text-sage-400 mt-0.5">Try two subjects/bodies on a sample of recipients, then auto-send the winner to everyone else</p>
          </div>
        </div>
        <Toggle checked={ab.enabled} onChange={() => set('abTest', { ...ab, enabled: !ab.enabled })} label="" />
      </div>

      {!ab.enabled ? (
        <SubjectPreviewBodyFields
          subject={c.subject} previewText={c.previewText} bodyHtml={c.bodyHtml}
          onSubject={v => set('subject', v)} onPreviewText={v => set('previewText', v)} onBodyHtml={v => set('bodyHtml', v)}
        />
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-1 bg-sage-100 rounded-lg p-1 w-fit">
            {(['Variant A', 'Variant B'] as const).map((label, idx) => (
              <button
                key={label}
                type="button"
                onClick={() => setVariantTab(idx as 0 | 1)}
                className={cn(
                  'px-4 py-1.5 rounded-md text-xs font-semibold transition-all',
                  variantTab === idx ? 'bg-white text-forest shadow-sm' : 'text-sage-500 hover:text-sage-700'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* key forces a fresh EmailEditor (tiptap) mount per variant — tiptap only
              reads `value` as its *initial* content and never resyncs after mount,
              so reusing one instance across tabs would leak variant A's content
              into variant B when switching. */}
          <SubjectPreviewBodyFields
            key={variantTab}
            subject={ab.variants[variantTab].subject}
            previewText={ab.variants[variantTab].previewText}
            bodyHtml={ab.variants[variantTab].bodyHtml}
            onSubject={v => setVariant(variantTab, { subject: v })}
            onPreviewText={v => setVariant(variantTab, { previewText: v })}
            onBodyHtml={v => setVariant(variantTab, { bodyHtml: v })}
          />

          <div className="divider" />
          <div className="space-y-4">
            <p className="text-xs font-semibold text-sage-500 uppercase tracking-wider">Test settings</p>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Test sample size</label>
                <div className="relative">
                  <input
                    type="number" min={10} max={100} step={5}
                    className="input pr-8"
                    value={ab.testPercent}
                    onChange={e => set('abTest', { ...ab, testPercent: Math.min(100, Math.max(1, parseInt(e.target.value) || 0)) })}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-sage-400">%</span>
                </div>
                <p className="text-xs text-sage-400 mt-1.5">Split evenly between A and B</p>
              </div>
              <div>
                <label className="label">Pick winner by</label>
                <div className="relative">
                  <select
                    className="input appearance-none pr-9"
                    value={ab.winnerMetric}
                    onChange={e => set('abTest', { ...ab, winnerMetric: e.target.value as 'openRate' | 'clickRate' })}
                  >
                    <option value="openRate">Open rate</option>
                    <option value="clickRate">Click rate</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sage-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="label">Test duration</label>
                <div className="relative">
                  <input
                    type="number" min={1} max={72}
                    className="input pr-14"
                    value={ab.testDurationHours}
                    onChange={e => set('abTest', { ...ab, testDurationHours: Math.max(1, parseInt(e.target.value) || 0) })}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-sage-400">hours</span>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
              <Clock className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                {ab.testPercent}% of recipients (split A/B) get the test emails first. After {ab.testDurationHours}h,
                whichever variant has the higher {ab.winnerMetric === 'openRate' ? 'open rate' : 'click rate'} is
                automatically sent to everyone else — or you can pick the winner early from the campaign's report page.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Step 3: Recipients ─────────────────────────────────────────────────────────
function StepRecipients({
  c, set, contacts, allTags, segments, contactsLoading,
}: {
  c: Campaign
  set: (k: keyof Campaign, v: any) => void
  contacts: ContactMini[]
  allTags: string[]
  segments: { id: number; name: string; count: number }[]
  contactsLoading: boolean
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-forest">Recipients</h2>
        <p className="text-sm text-sage-400 mt-0.5">Choose who receives this campaign</p>
      </div>
      <RecipientSelector
        contacts={contacts}
        allTags={allTags}
        segments={segments}
        loading={contactsLoading}
        value={c.recipients}
        onChange={v => set('recipients', v)}
      />
    </div>
  )
}

// ── Step 4: Schedule ───────────────────────────────────────────────────────────
function StepSchedule({ c, set }: { c: Campaign; set: (k: keyof Campaign, v: any) => void }) {
  const minDate = new Date()
  minDate.setMinutes(minDate.getMinutes() + 5)
  const minStr = minDate.toISOString().slice(0, 16)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-forest">When to send</h2>
        <p className="text-sm text-sage-400 mt-0.5">Choose your send time</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[
          { type: 'now' as const, icon: Send, label: 'Send now', desc: 'Emails will queue immediately and send within minutes' },
          { type: 'scheduled' as const, icon: Clock, label: 'Schedule', desc: 'Pick a specific date and time to send' },
        ].map(opt => (
          <button
            key={opt.type}
            type="button"
            onClick={() => set('scheduleType', opt.type)}
            className={cn(
              'flex flex-col items-start gap-3 p-5 rounded-xl border-2 text-left transition-all',
              c.scheduleType === opt.type ? 'border-forest bg-forest/5' : 'border-sage-200 hover:border-sage-300 bg-white'
            )}
          >
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', c.scheduleType === opt.type ? 'bg-forest text-white' : 'bg-sage-100 text-sage-500')}>
              <opt.icon className="w-5 h-5" />
            </div>
            <div>
              <p className={cn('text-sm font-semibold', c.scheduleType === opt.type ? 'text-forest' : 'text-sage-700')}>{opt.label}</p>
              <p className="text-xs text-sage-400 mt-1 leading-relaxed">{opt.desc}</p>
            </div>
            {c.scheduleType === opt.type && <CheckCircle className="w-4 h-4 text-forest" />}
          </button>
        ))}
      </div>

      {c.scheduleType === 'scheduled' && (
        <div className="card !bg-sage-50 space-y-4">
          <div>
            <label className="label">Send date & time <span className="text-red-400">*</span></label>
            <input
              type="datetime-local"
              className="input"
              min={minStr}
              value={c.scheduledAt}
              onChange={e => set('scheduledAt', e.target.value)}
            />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
            <Clock className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Time zone note</p>
              <p className="mt-0.5 text-amber-700">Scheduled time is in your server's timezone. Best send times: Tue–Thu, 10am–11am or 2pm–4pm.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Step 5: Review ─────────────────────────────────────────────────────────────
function StepReview({
  c, accounts, estimatedRecipients, onSend, sending, sendError,
}: {
  c: Campaign
  accounts: Account[]
  estimatedRecipients: number
  onSend: () => void
  sending: boolean
  sendError: string | null
}) {
  const fromAccount = accounts.find(a => a.id === c.fromAccountId)
  const ab = c.abTest.enabled ? c.abTest : null
  const bodyHasContent = (html: string) => html.replace(/<[^>]*>/g, '').trim().length > 0
  const effectiveSubject = ab ? ab.variants.map(v => v.subject).join('  /  ') : c.subject
  const effectiveBodyOk = ab ? ab.variants.every(v => bodyHasContent(v.bodyHtml)) : bodyHasContent(c.bodyHtml)
  const effectiveBodyLen = ab ? ab.variants[0].bodyHtml.replace(/<[^>]*>/g, '').length : c.bodyHtml.replace(/<[^>]*>/g, '').length

  const checks = [
    { label: 'Campaign name', ok: c.name.length > 0,                                      value: c.name },
    { label: 'From account',  ok: fromAccount?.status === 'connected',                    value: fromAccount?.email || '(none selected)' },
    { label: ab ? 'Subject lines (A/B)' : 'Subject line', ok: ab ? ab.variants.every(v => v.subject.length > 0) : c.subject.length > 0, value: effectiveSubject || '(missing)' },
    { label: 'Email body',    ok: effectiveBodyOk,                                        value: 'Content written' },
    { label: 'Recipients',    ok: estimatedRecipients > 0,                                 value: `~${estimatedRecipients} contacts` },
    { label: 'Send time',     ok: c.scheduleType === 'now' || !!c.scheduledAt,            value: c.scheduleType === 'now' ? 'Send immediately' : c.scheduledAt },
  ]

  const allGood = checks.every(ch => ch.ok)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-forest">Review & send</h2>
        <p className="text-sm text-sage-400 mt-0.5">Double-check everything before sending</p>
      </div>

      <div className="card space-y-3">
        <p className="text-xs font-semibold text-sage-500 uppercase tracking-wider">Pre-flight checklist</p>
        {checks.map(ch => (
          <div key={ch.label} className="flex items-center justify-between py-2.5 border-b border-sage-50 last:border-0">
            <div className="flex items-center gap-3">
              {ch.ok
                ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                : <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              }
              <span className="text-sm text-sage-600">{ch.label}</span>
            </div>
            <span className={cn('text-xs font-medium truncate max-w-[200px]', ch.ok ? 'text-forest' : 'text-red-500')}>
              {ch.ok ? ch.value : '✗ Required'}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card !bg-sage-50 space-y-3">
          <p className="text-xs font-semibold text-sage-500 uppercase tracking-wider">Campaign summary</p>
          <div className="space-y-2">
            {[
              ['Name', c.name || '—'],
              ['From', fromAccount?.email || '—'],
              ['Reply-to', c.replyTo || fromAccount?.email || '—'],
              ['Open tracking', c.trackOpens ? 'Enabled' : 'Disabled'],
              ['Click tracking', c.trackClicks ? 'Enabled' : 'Disabled'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs">
                <span className="text-sage-500">{k}</span>
                <span className="font-medium text-sage-800 text-right max-w-[180px] truncate">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card !bg-sage-50 space-y-3">
          <p className="text-xs font-semibold text-sage-500 uppercase tracking-wider">Send info</p>
          <div className="space-y-2">
            {[
              ['Recipients', `~${estimatedRecipients} contacts`],
              ...(ab
                ? [
                    ['Subject A', ab.variants[0].subject || '—'],
                    ['Subject B', ab.variants[1].subject || '—'],
                    ['Test sample', `${ab.testPercent}% (split A/B)`],
                    ['Winner picked by', `${ab.winnerMetric === 'openRate' ? 'Open rate' : 'Click rate'} after ${ab.testDurationHours}h`],
                  ]
                : [['Subject', c.subject || '—']]),
              ['When', c.scheduleType === 'now' ? 'Immediately' : c.scheduledAt || '—'],
              ['Body length', `${effectiveBodyLen} chars`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs">
                <span className="text-sage-500">{k}</span>
                <span className="font-medium text-sage-800 text-right max-w-[180px] truncate">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {ab && (
        <div className="flex items-center gap-2 bg-forest/5 border border-forest/20 rounded-xl px-4 py-3 text-xs text-forest">
          <FlaskConical className="w-4 h-4 shrink-0" />
          <span>
            This is an A/B test — {ab.testPercent}% of recipients get variant A or B first, then the winner
            (by {ab.winnerMetric === 'openRate' ? 'open rate' : 'click rate'}) is sent to everyone else after {ab.testDurationHours}h.
          </span>
        </div>
      )}

      {sendError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
          <span>{sendError}</span>
        </div>
      )}

      <div className={cn('rounded-xl p-4 border', allGood ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200')}>
        {allGood ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-semibold text-green-800">Ready to {c.scheduleType === 'now' ? 'send' : 'schedule'}!</p>
                <p className="text-xs text-green-600 mt-0.5">All checks passed. ~{estimatedRecipients} emails will be queued.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onSend}
              disabled={sending}
              className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {c.scheduleType === 'now' ? 'Sending…' : 'Scheduling…'}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {c.scheduleType === 'now' ? `Send to ~${estimatedRecipients} contacts` : 'Schedule campaign'}
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-700">Please fix the issues above before sending.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Wizard ────────────────────────────────────────────────────────────────
export default function CampaignWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [campaign, setCampaign] = useState<Campaign>(DEFAULT)
  const [showPreview, setShowPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sentResult, setSentResult] = useState<{ count: number; scheduled: boolean; message?: string } | null>(null)

  const { data: accountsRaw, loading: accountsLoading } = useData<Account[]>('/api/accounts')
  const { data: contactsRaw, loading: contactsLoading } = useData<{ contacts: ContactMini[]; total: number }>('/api/contacts?limit=1000')
  const { data: segmentsRaw } = useData<{ id: number; name: string; count: number }[]>('/api/segments')

  const accounts = accountsRaw || []
  const contacts = contactsRaw?.contacts || []
  const segments = segmentsRaw || []
  const allTags = useMemo(
    () => [...new Set(contacts.flatMap(c => c.tags || []))].sort(),
    [contacts]
  )

  // Auto-select first connected account when accounts load
  useEffect(() => {
    if (accounts.length > 0 && campaign.fromAccountId === 0) {
      const first = accounts.find(a => a.status === 'connected') || accounts[0]
      setCampaign(p => ({ ...p, fromAccountId: first.id }))
    }
  }, [accounts])

  const set = (k: keyof Campaign, v: any) => setCampaign(p => ({ ...p, [k]: v }))

  const estimatedRecipients = useMemo(() => {
    const subscribed = contacts.filter(c => c.status === 'subscribed')
    if (campaign.recipients.type === 'all') return subscribed.length
    if (campaign.recipients.type === 'tags')
      return subscribed.filter(c => campaign.recipients.tags.some(t => (c.tags || []).includes(t))).length
    if (campaign.recipients.type === 'segment')
      return segments.find(s => s.id === campaign.recipients.segmentId)?.count ?? 0
    return campaign.recipients.contactIds.length
  }, [contacts, campaign.recipients, segments])

  const bodyHasContent = (html: string) => html.replace(/<[^>]*>/g, '').trim().length > 0
  const abValid = campaign.abTest.variants.every(v => v.subject.length > 0 && bodyHasContent(v.bodyHtml))

  const canNext: Record<number, boolean> = {
    1: campaign.name.length > 0 && campaign.fromAccountId !== 0,
    2: campaign.abTest.enabled ? abValid : (campaign.subject.length > 0 && bodyHasContent(campaign.bodyHtml)),
    3: campaign.recipients.type === 'all' ||
       (campaign.recipients.type === 'tags' && campaign.recipients.tags.length > 0) ||
       (campaign.recipients.type === 'segment' && campaign.recipients.segmentId !== null) ||
       (campaign.recipients.type === 'specific' && campaign.recipients.contactIds.length > 0),
    4: campaign.scheduleType === 'now' || !!campaign.scheduledAt,
    5: true,
  }

  const handleSend = async () => {
    setSending(true)
    setSendError(null)
    try {
      const fromAccount = accounts.find(a => a.id === campaign.fromAccountId)

      // Build payload for the server
      const payload: Record<string, any> = {
        name:         campaign.name,
        fromAccountId: campaign.fromAccountId,
        fromName:     fromAccount?.fromName || fromAccount?.name || '',
        replyTo:      campaign.replyTo || undefined,
        trackOpens:   campaign.trackOpens,
        trackClicks:  campaign.trackClicks,
        scheduledAt:  campaign.scheduleType === 'scheduled' ? campaign.scheduledAt : null,
      }

      if (campaign.abTest.enabled) {
        // Top-level subject/htmlBody mirror variant A so anything that reads
        // them directly (e.g. the campaigns list preview) has sane content.
        payload.subject = campaign.abTest.variants[0].subject
        payload.previewText = campaign.abTest.variants[0].previewText
        payload.htmlBody = campaign.abTest.variants[0].bodyHtml
        payload.abTest = {
          enabled: true,
          variants: campaign.abTest.variants.map(v => ({ subject: v.subject, previewText: v.previewText, htmlBody: v.bodyHtml })),
          testPercent: campaign.abTest.testPercent,
          winnerMetric: campaign.abTest.winnerMetric,
          testDurationHours: campaign.abTest.testDurationHours,
        }
      } else {
        payload.subject = campaign.subject
        payload.previewText = campaign.previewText
        payload.htmlBody = campaign.bodyHtml  // server uses htmlBody
      }

      // Map recipient selection to server fields
      if (campaign.recipients.type === 'tags') {
        payload.tags = campaign.recipients.tags
      } else if (campaign.recipients.type === 'segment') {
        payload.segmentId = campaign.recipients.segmentId
      } else if (campaign.recipients.type === 'specific') {
        payload.contactIds = campaign.recipients.contactIds
      }
      // 'all' → no tags/contactIds → server sends to all subscribed

      // 1. Create the campaign
      const created = await apiFetch<{ id: number }>('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      if (campaign.scheduleType === 'now') {
        // 2. Fire the send
        const r = await apiFetch<{ ok: boolean; recipientCount: number; message: string }>(
          `/api/campaigns/${created.id}/send`, { method: 'POST' }
        )
        setSentResult({ count: r.recipientCount, scheduled: false, message: r.message })
      } else {
        setSentResult({ count: estimatedRecipients, scheduled: true })
      }
    } catch (e: any) {
      setSendError(e.message || 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const fromAccount = accounts.find(a => a.id === campaign.fromAccountId)

  if (sentResult) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-forest">
            Campaign {sentResult.scheduled ? 'scheduled!' : 'sent!'}
          </h1>
          <p className="text-sage-500 mt-2">
            {sentResult.scheduled
              ? `Saved and scheduled for ${campaign.scheduledAt}.`
              : sentResult.message || `Queued for ${sentResult.count} contact${sentResult.count !== 1 ? 's' : ''}. Emails will be delivered within minutes.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/campaigns')} className="btn-secondary">View all campaigns</button>
          <button
            onClick={() => { setSentResult(null); setCampaign(DEFAULT); setStep(1) }}
            className="btn-primary"
          >
            <Send className="w-4 h-4" />
            Create another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/campaigns')}
          className="w-8 h-8 rounded-lg hover:bg-sage-200 flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-sage-600" />
        </button>
        <div>
          <h1 className="page-title">New campaign</h1>
          <p className="page-subtitle">Step {step} of {STEPS.length} — {STEPS[step - 1].label}</p>
        </div>
      </div>

      <div className="card !py-3">
        <StepIndicator current={step} />
      </div>

      <div className="card">
        {step === 1 && (
          <StepDetails
            c={campaign}
            set={set}
            accounts={accounts}
            accountsLoading={accountsLoading}
          />
        )}
        {step === 2 && <StepEmail c={campaign} set={set} onPreview={() => setShowPreview(true)} />}
        {step === 3 && (
          <StepRecipients
            c={campaign}
            set={set}
            contacts={contacts}
            allTags={allTags}
            segments={segments}
            contactsLoading={contactsLoading}
          />
        )}
        {step === 4 && <StepSchedule c={campaign} set={set} />}
        {step === 5 && (
          <StepReview
            c={campaign}
            accounts={accounts}
            estimatedRecipients={estimatedRecipients}
            onSend={handleSend}
            sending={sending}
            sendError={sendError}
          />
        )}
      </div>

      {step < 5 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep(p => Math.max(1, p - 1))}
            className="btn-secondary"
            disabled={step === 1}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={() => setStep(p => Math.min(5, p + 1))}
            className="btn-primary"
            disabled={!canNext[step]}
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
      {step === 5 && (
        <div className="flex justify-start">
          <button onClick={() => setStep(4)} className="btn-secondary">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      )}

      {showPreview && (
        <EmailPreview
          subject={campaign.subject}
          previewText={campaign.previewText}
          bodyHtml={campaign.bodyHtml}
          fromName={fromAccount?.fromName || fromAccount?.name || 'Sender'}
          fromEmail={fromAccount?.email || ''}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  )
}
