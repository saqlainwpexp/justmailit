import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User, Bell, Shield, Clock, Save, Key, Users, CreditCard,
  Plus, Trash2, Copy, Eye, EyeOff, Check, AlertCircle,
  RefreshCw, CheckCircle, Crown, Mail, Loader2,
} from 'lucide-react'
import { apiFetch, useData } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiKey {
  id: number
  name: string
  keyPrefix: string
  createdAt: string
  lastUsedAt: string | null
  scopes: string[]
}

interface SendingDefaults {
  defaultAccountId: number | null
  dailyLimit: number
  windowStart: string
  windowEnd: string
  timezone: string
  unsubscribeFooter: string
}

interface Account {
  id: number
  name: string
  email: string
  status: string
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-forest' : 'bg-sage-200'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}

const TABS = [
  { id: 'profile',       label: 'Profile',           icon: User      },
  { id: 'notifications', label: 'Notifications',      icon: Bell      },
  { id: 'sending',       label: 'Sending defaults',   icon: Clock     },
  { id: 'security',      label: 'Security',           icon: Shield    },
  { id: 'api',           label: 'API keys',           icon: Key       },
  { id: 'team',          label: 'Team',               icon: Users     },
  { id: 'billing',       label: 'Billing',            icon: CreditCard},
]

const ROLE_COLORS: Record<string, string> = {
  owner:  'bg-forest/10 text-forest',
  admin:  'bg-blue-50 text-blue-700',
  member: 'bg-sage-100 text-sage-600',
}

// ─── StatusMsg ────────────────────────────────────────────────────────────────

function StatusMsg({ ok, msg }: { ok: boolean | null; msg: string }) {
  if (!msg) return null
  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium
      ${ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
      {ok ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
      {msg}
    </div>
  )
}

// ─── Profile tab ──────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', bio: '', defaultSenderName: '' })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    apiFetch<{ name: string; email: string; bio: string; defaultSenderName: string }>('/api/settings/profile')
      .then(d => setForm({ name: d.name, email: d.email, bio: d.bio, defaultSenderName: d.defaultSenderName }))
      .catch(() => {})
  }, [])

  async function save() {
    setSaving(true); setStatus(null)
    try {
      await apiFetch('/api/settings/profile', { method: 'PUT', body: JSON.stringify(form) })
      setStatus({ ok: true, msg: 'Profile saved successfully.' })
    } catch (e: any) {
      setStatus({ ok: false, msg: e.message })
    } finally {
      setSaving(false)
    }
  }

  const initials = (form.name || user?.name || 'U').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="card space-y-5">
      <h2 className="section-title">Profile</h2>
      <div className="flex items-center gap-5 pb-5 border-b border-sage-100">
        <div className="w-16 h-16 rounded-full bg-forest flex items-center justify-center shrink-0">
          <span className="text-xl font-bold text-white">{initials}</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-forest">{form.name || user?.name}</p>
          <p className="text-xs text-sage-400">{form.email || user?.email}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Full name</label>
          <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name" />
        </div>
        <div>
          <label className="label">Email address</label>
          <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <label className="label">Default sender name</label>
          <input className="input" value={form.defaultSenderName} onChange={e => setForm(f => ({ ...f, defaultSenderName: e.target.value }))} placeholder="Name shown in From field" />
        </div>
        <div className="col-span-2">
          <label className="label">Bio / signature snippet</label>
          <textarea className="input resize-none" rows={2} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Optional intro line for email signatures" />
        </div>
      </div>
      {status && <StatusMsg ok={status.ok} msg={status.msg} />}
      <div className="flex justify-end">
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

// ─── Notifications tab ────────────────────────────────────────────────────────

function NotificationsTab() {
  const [notifs, setNotifs] = useState({
    opens: true, clicks: false, replies: true, bounces: true,
    unsubscribes: false, weeklyReport: true, campaignComplete: true,
  })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    apiFetch<typeof notifs>('/api/settings/notification-prefs')
      .then(d => { setNotifs(d); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  const toggle = (k: keyof typeof notifs) => setNotifs(p => ({ ...p, [k]: !p[k] }))

  async function save() {
    setSaving(true); setStatus(null)
    try {
      await apiFetch('/api/settings/notification-prefs', { method: 'PUT', body: JSON.stringify(notifs) })
      setStatus({ ok: true, msg: 'Preferences saved.' })
    } catch (e: any) {
      setStatus({ ok: false, msg: e.message })
    } finally {
      setSaving(false)
    }
  }

  const groups = [
    {
      label: 'Email activity',
      items: [
        { key: 'opens',        label: 'Email opens',    desc: 'When a contact opens your email' },
        { key: 'clicks',       label: 'Link clicks',    desc: 'When a contact clicks a link' },
        { key: 'replies',      label: 'Replies',        desc: 'When a contact replies to your email' },
        { key: 'bounces',      label: 'Bounces',        desc: 'When an email hard bounces' },
        { key: 'unsubscribes', label: 'Unsubscribes',   desc: 'When a contact unsubscribes' },
      ],
    },
    {
      label: 'Reports & campaigns',
      items: [
        { key: 'weeklyReport',     label: 'Weekly performance report', desc: 'Summary of opens, clicks, and replies every Monday' },
        { key: 'campaignComplete', label: 'Campaign sent',             desc: 'When a campaign finishes sending' },
      ],
    },
  ]

  if (!loaded) return <div className="card flex items-center gap-2 text-xs text-sage-400"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>

  return (
    <div className="card space-y-6">
      <h2 className="section-title">Notification preferences</h2>
      {groups.map(g => (
        <div key={g.label}>
          <p className="text-xs font-semibold text-sage-400 uppercase tracking-wider mb-3">{g.label}</p>
          <div className="space-y-0 divide-y divide-sage-100">
            {g.items.map(n => (
              <div key={n.key} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-forest">{n.label}</p>
                  <p className="text-xs text-sage-400 mt-0.5">{n.desc}</p>
                </div>
                <Toggle checked={notifs[n.key as keyof typeof notifs]} onChange={() => toggle(n.key as keyof typeof notifs)} />
              </div>
            ))}
          </div>
        </div>
      ))}
      {status && <StatusMsg ok={status.ok} msg={status.msg} />}
      <div className="flex justify-end">
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </div>
    </div>
  )
}

// ─── Sending defaults tab ─────────────────────────────────────────────────────

function SendingTab() {
  const { data: accounts } = useData<Account[]>('/api/accounts')
  const [form, setForm] = useState<SendingDefaults>({
    defaultAccountId: null,
    dailyLimit: 100,
    windowStart: '08:00',
    windowEnd: '18:00',
    timezone: 'UTC+5:00 — Karachi / Islamabad',
    unsubscribeFooter: 'You are receiving this because you opted in. Click here to unsubscribe.',
  })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    apiFetch<SendingDefaults>('/api/settings/sending-defaults')
      .then(d => { setForm(d); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  async function save() {
    setSaving(true); setStatus(null)
    try {
      await apiFetch('/api/settings/sending-defaults', { method: 'PUT', body: JSON.stringify(form) })
      setStatus({ ok: true, msg: 'Sending defaults saved.' })
    } catch (e: any) {
      setStatus({ ok: false, msg: e.message })
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return <div className="card flex items-center gap-2 text-xs text-sage-400"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>

  return (
    <div className="card space-y-5">
      <h2 className="section-title">Sending defaults</h2>
      <div className="space-y-4">
        <div>
          <label className="label">Default sending account</label>
          <select className="input" value={form.defaultAccountId ?? ''} onChange={e => setForm(f => ({ ...f, defaultAccountId: e.target.value ? parseInt(e.target.value) : null }))}>
            <option value="">— None selected —</option>
            {(accounts || []).map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
            ))}
          </select>
          {(!accounts || accounts.length === 0) && (
            <p className="text-xs text-sage-400 mt-1">No email accounts yet. <a href="/accounts" className="text-forest hover:underline">Add one →</a></p>
          )}
        </div>
        <div>
          <label className="label">Daily sending limit per account</label>
          <input className="input" type="number" min={1} max={10000} value={form.dailyLimit} onChange={e => setForm(f => ({ ...f, dailyLimit: parseInt(e.target.value) || 100 }))} />
          <p className="text-xs text-sage-400 mt-1.5">Recommended: 50–100/day per account for best deliverability</p>
        </div>
        <div>
          <label className="label">Sending window</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-sage-500 mb-1">Start time</p>
              <input className="input" type="time" value={form.windowStart} onChange={e => setForm(f => ({ ...f, windowStart: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-sage-500 mb-1">End time</p>
              <input className="input" type="time" value={form.windowEnd} onChange={e => setForm(f => ({ ...f, windowEnd: e.target.value }))} />
            </div>
          </div>
          <p className="text-xs text-sage-400 mt-1.5">Emails will only be sent during this window</p>
        </div>
        <div>
          <label className="label">Default sending timezone</label>
          <select className="input" value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}>
            <option>UTC+5:00 — Karachi / Islamabad</option>
            <option>UTC+0:00 — London</option>
            <option>UTC-5:00 — New York</option>
            <option>UTC-8:00 — Los Angeles</option>
            <option>UTC+1:00 — Paris / Berlin</option>
            <option>UTC+8:00 — Singapore / Beijing</option>
          </select>
        </div>
        <div>
          <label className="label">Unsubscribe footer text</label>
          <textarea className="input resize-none" rows={2} value={form.unsubscribeFooter} onChange={e => setForm(f => ({ ...f, unsubscribeFooter: e.target.value }))} />
        </div>
        {status && <StatusMsg ok={status.ok} msg={status.msg} />}
        <div className="flex justify-end">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save defaults'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Security tab ─────────────────────────────────────────────────────────────

function SecurityTab() {
  const [current,  setCurrent]  = useState('')
  const [newPw,    setNewPw]    = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showCur,  setShowCur]  = useState(false)
  const [showNew,  setShowNew]  = useState(false)
  const [showCon,  setShowCon]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [status,   setStatus]   = useState<{ ok: boolean; msg: string } | null>(null)

  async function changePassword() {
    if (newPw !== confirm) { setStatus({ ok: false, msg: 'New passwords do not match.' }); return }
    setSaving(true); setStatus(null)
    try {
      await apiFetch('/api/settings/change-password', {
        method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: newPw }),
      })
      setStatus({ ok: true, msg: 'Password updated successfully.' })
      setCurrent(''); setNewPw(''); setConfirm('')
    } catch (e: any) {
      setStatus({ ok: false, msg: e.message })
    } finally {
      setSaving(false)
    }
  }

  const fields = [
    { label: 'Current password',     value: current,  set: setCurrent,  show: showCur, setShow: setShowCur, complete: 'current-password' },
    { label: 'New password',         value: newPw,    set: setNewPw,    show: showNew, setShow: setShowNew, complete: 'new-password' },
    { label: 'Confirm new password', value: confirm,  set: setConfirm,  show: showCon, setShow: setShowCon, complete: 'new-password' },
  ]

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <h2 className="section-title">Change password</h2>
        {fields.map(f => (
          <div key={f.label}>
            <label className="label">{f.label}</label>
            <div className="relative">
              <input
                type={f.show ? 'text' : 'password'}
                className="input pr-10"
                placeholder="••••••••"
                autoComplete={f.complete}
                value={f.value}
                onChange={e => f.set(e.target.value)}
              />
              <button
                type="button"
                onClick={() => f.setShow((p: boolean) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sage-400 hover:text-sage-600"
              >
                {f.show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ))}
        <div className="bg-sage-50 rounded-xl p-3.5 text-xs text-sage-500">
          Password requirements: 8+ characters, uppercase, lowercase, number, and special character.
        </div>
        {status && <StatusMsg ok={status.ok} msg={status.msg} />}
        <div className="flex justify-end">
          <button
            className="btn-primary"
            onClick={changePassword}
            disabled={saving || !current || !newPw || !confirm}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {saving ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </div>

      <div className="card bg-sage-50/50">
        <h2 className="section-title mb-1">Two-factor authentication</h2>
        <p className="text-xs text-sage-400 mb-3">Extra security via TOTP authenticator apps.</p>
        <span className="text-[10px] bg-sage-200 text-sage-600 font-semibold px-2.5 py-1 rounded-full">Coming soon</span>
      </div>
    </div>
  )
}

// ─── Transactional email API ──────────────────────────────────────────────────

interface TxLog {
  id: number
  to: string
  subject: string
  status: 'sent' | 'failed' | 'pending'
  error: string | null
  createdAt: string
}

const TX_STATUS_STYLE: Record<TxLog['status'], string> = {
  sent: 'bg-green-50 text-green-700',
  failed: 'bg-red-50 text-red-600',
  pending: 'bg-amber-50 text-amber-700',
}

function TransactionalApiSection() {
  const [logs, setLogs] = useState<TxLog[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    apiFetch<TxLog[]>('/api/transactional-logs').then(setLogs).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const snippet = `curl -X POST ${window.location.origin}/api/v1/send \\
  -H "api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "customer@example.com",
    "subject": "Your order has shipped",
    "htmlBody": "<p>Thanks for your order! It is on its way.</p>"
  }'`

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="section-title">Transactional email API</h2>
        <p className="text-xs text-sage-400 mt-0.5">Send a single email from your own code — receipts, password resets, order updates — outside the campaign flow.</p>
      </div>
      <div className="relative bg-sage-900 rounded-xl p-4">
        <button
          onClick={() => { navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          className="absolute top-3 right-3 text-sage-400 hover:text-white transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
        <pre className="text-[11px] text-sage-200 font-mono whitespace-pre-wrap leading-relaxed">{snippet}</pre>
      </div>
      <p className="text-[11px] text-sage-400">
        Optional fields: <code className="bg-sage-50 px-1 py-0.5 rounded">replyTo</code>, <code className="bg-sage-50 px-1 py-0.5 rounded">fromAccountId</code> (defaults to your first connected account), <code className="bg-sage-50 px-1 py-0.5 rounded">text</code> (plain-text fallback).
      </p>

      <div>
        <p className="text-xs font-semibold text-sage-600 mb-2">Recent sends</p>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-sage-400"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
        ) : logs.length === 0 ? (
          <p className="text-xs text-sage-400 py-4">No transactional emails sent yet.</p>
        ) : (
          <div className="divide-y divide-sage-50">
            {logs.slice(0, 20).map(l => (
              <div key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-sage-700 truncate">{l.subject}</p>
                  <p className="text-[11px] text-sage-400 truncate">{l.to} · {new Date(l.createdAt).toLocaleString()}</p>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${TX_STATUS_STYLE[l.status]}`}>{l.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── API Keys tab ─────────────────────────────────────────────────────────────

function ApiTab() {
  const [keys,         setKeys]         = useState<ApiKey[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showCreate,   setShowCreate]   = useState(false)
  const [newName,      setNewName]      = useState('')
  const [newScopes,    setNewScopes]    = useState<string[]>([])
  const [creating,     setCreating]     = useState(false)
  const [createErr,    setCreateErr]    = useState('')
  const [createdKey,   setCreatedKey]   = useState<string | null>(null)
  const [copied,       setCopied]       = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const [deleting,     setDeleting]     = useState(false)

  const ALL_SCOPES = ['campaigns:read','campaigns:write','contacts:read','contacts:write','templates:read','templates:write','analytics:read']

  useEffect(() => {
    apiFetch<ApiKey[]>('/api/settings/api-keys')
      .then(setKeys)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function toggleScope(s: string) {
    setNewScopes(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])
  }

  async function createKey() {
    if (!newName.trim()) return
    setCreating(true); setCreateErr('')
    try {
      const res = await apiFetch<ApiKey & { fullKey: string }>('/api/settings/api-keys', {
        method: 'POST', body: JSON.stringify({ name: newName, scopes: newScopes }),
      })
      setCreatedKey(res.fullKey)
      setKeys(prev => [...prev, { id: res.id, name: res.name, keyPrefix: res.keyPrefix, createdAt: res.createdAt, lastUsedAt: null, scopes: res.scopes }])
      setNewName(''); setNewScopes([]); setShowCreate(false)
    } catch (e: any) {
      setCreateErr(e.message)
    } finally {
      setCreating(false)
    }
  }

  async function revokeKey() {
    if (deleteTarget === null) return
    setDeleting(true)
    try {
      await apiFetch(`/api/settings/api-keys/${deleteTarget}`, { method: 'DELETE' })
      setKeys(prev => prev.filter(k => k.id !== deleteTarget))
      setDeleteTarget(null)
    } catch { /* silently ignore */ }
    finally { setDeleting(false) }
  }

  function copyKey() {
    if (!createdKey) return
    navigator.clipboard.writeText(createdKey)
    setCopied(true)
    setTimeout(() => { setCopied(false); setCreatedKey(null) }, 2000)
  }

  return (
    <div className="space-y-4">
      {createdKey && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-green-800 mb-1">API key created — copy it now</p>
              <p className="text-[11px] text-green-700 mb-2">This is the only time the full key will be shown. It cannot be recovered.</p>
              <div className="flex items-center gap-2 bg-white border border-green-200 rounded-lg px-3 py-2">
                <code className="text-xs font-mono text-green-800 flex-1 break-all select-all">{createdKey}</code>
                <button onClick={copyKey} className="text-green-600 hover:text-green-800 shrink-0">
                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="section-title">API keys</h2>
            <p className="text-xs text-sage-400 mt-0.5">Authenticate requests from your integrations</p>
          </div>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />New key
          </button>
        </div>

        {showCreate && (
          <div className="bg-sage-50 border border-sage-200 rounded-xl p-4 mb-4 space-y-3">
            <p className="text-xs font-semibold text-forest">Create new API key</p>
            <div>
              <label className="label">Key name</label>
              <input className="input" placeholder="e.g. Zapier Integration" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div>
              <label className="label">Scopes (permissions)</label>
              <div className="flex flex-wrap gap-2">
                {ALL_SCOPES.map(s => (
                  <button
                    key={s}
                    onClick={() => toggleScope(s)}
                    className={`text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors
                      ${newScopes.includes(s)
                        ? 'bg-forest text-white border-forest'
                        : 'border-sage-200 text-sage-600 hover:border-forest hover:text-forest'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {createErr && <p className="text-xs text-red-600">{createErr}</p>}
            <div className="flex gap-2">
              <button className="btn-secondary text-xs" onClick={() => { setShowCreate(false); setCreateErr('') }}>Cancel</button>
              <button className="btn-primary text-xs" onClick={createKey} disabled={creating || !newName.trim()}>
                {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {creating ? 'Creating…' : 'Create key'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-xs text-sage-400">
            <Loader2 className="w-4 h-4 animate-spin" />Loading keys…
          </div>
        ) : keys.length === 0 ? (
          <div className="py-8 text-center text-xs text-sage-400">No API keys yet. Create one to get started.</div>
        ) : (
          <div className="space-y-3">
            {keys.map(k => (
              <div key={k.id} className="border border-sage-100 rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-forest">{k.name}</p>
                    <p className="text-[11px] text-sage-400 mt-0.5">
                      Created {new Date(k.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' · '}Last used: {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}
                    </p>
                  </div>
                  <button onClick={() => setDeleteTarget(k.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-sage-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2 bg-sage-50 border border-sage-100 rounded-lg px-3 py-2 mb-3">
                  <code className="text-xs font-mono text-sage-600 flex-1">
                    {k.keyPrefix}{'•'.repeat(14)}
                  </code>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {k.scopes.map(s => (
                    <span key={s} className="text-[10px] bg-forest/8 text-forest px-2 py-0.5 rounded-full font-medium">{s}</span>
                  ))}
                  {k.scopes.length === 0 && <span className="text-[10px] text-sage-400">No scopes — full access</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-amber-800">Keep your API keys secret</p>
          <p className="text-[11px] text-amber-700 mt-0.5">Never commit keys to version control or share them publicly. Full keys are shown only once on creation and cannot be recovered.</p>
        </div>
      </div>

      <TransactionalApiSection />

      {deleteTarget !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <p className="text-sm font-semibold text-sage-900 mb-2">Revoke API key?</p>
            <p className="text-xs text-sage-500 mb-5">This key will stop working immediately. Any integrations using it will break.</p>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                onClick={revokeKey}
                disabled={deleting}
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {deleting ? 'Revoking…' : 'Revoke key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Team tab ─────────────────────────────────────────────────────────────────

interface WorkspaceMember { userId: number; name: string; email: string; role: 'owner' | 'member'; joinedAt: string }
interface PendingInvite { email: string; invitedAt: string }
interface MembersResponse { members: WorkspaceMember[]; pendingInvites: PendingInvite[] }

function initialsOf(name: string) { return (name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) }

function TeamTab() {
  const { user } = useAuth()
  const { activeWorkspace, workspaces, reload: reloadWorkspaces } = useWorkspace()
  const [data, setData] = useState<MembersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [wsName, setWsName] = useState(activeWorkspace?.name || '')
  const [renameBusy, setRenameBusy] = useState(false)

  const isOwner = activeWorkspace?.role === 'owner'

  function load() {
    if (!activeWorkspace) return
    setLoading(true)
    apiFetch<MembersResponse>(`/api/workspaces/${activeWorkspace.id}/members`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(); setWsName(activeWorkspace?.name || '') }, [activeWorkspace?.id])

  async function sendInvite() {
    if (!inviteEmail.trim() || !activeWorkspace) return
    setInviteBusy(true); setInviteMsg(null)
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}/invite`, { json: { email: inviteEmail.trim() } })
      setInviteMsg({ ok: true, text: `Invite sent to ${inviteEmail.trim()}` })
      setInviteEmail('')
      load()
    } catch (e: any) {
      setInviteMsg({ ok: false, text: e.message })
    } finally {
      setInviteBusy(false)
      setTimeout(() => setInviteMsg(null), 4000)
    }
  }

  async function removeMember(userId: number) {
    if (!activeWorkspace) return
    if (!confirm('Remove this person from the workspace?')) return
    await apiFetch(`/api/workspaces/${activeWorkspace.id}/members/${userId}`, { method: 'DELETE' })
    load()
  }

  async function saveRename() {
    if (!activeWorkspace || !wsName.trim()) return
    setRenameBusy(true)
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}`, { method: 'PATCH', json: { name: wsName.trim() } })
      await reloadWorkspaces()
      setRenaming(false)
    } finally {
      setRenameBusy(false)
    }
  }

  async function deleteWorkspace() {
    if (!activeWorkspace) return
    if (workspaces.length <= 1) { alert('This is your only workspace — you cannot delete it.'); return }
    if (!confirm(`Delete "${activeWorkspace.name}" permanently? This deletes all its contacts, campaigns, domains, and other data. This cannot be undone.`)) return
    await apiFetch(`/api/workspaces/${activeWorkspace.id}`, { method: 'DELETE' })
    window.location.href = '/'
  }

  if (!activeWorkspace) return <div className="card text-sm text-sage-400">Loading workspace…</div>

  return (
    <div className="space-y-4">
      {/* Workspace name */}
      <div className="card">
        <h2 className="section-title mb-4">Workspace</h2>
        {renaming ? (
          <div className="flex gap-3">
            <input className="input flex-1" value={wsName} onChange={e => setWsName(e.target.value)} autoFocus />
            <button className="btn-primary" onClick={saveRename} disabled={renameBusy || !wsName.trim()}>
              {renameBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Save
            </button>
            <button className="btn-ghost" onClick={() => { setRenaming(false); setWsName(activeWorkspace.name) }}>Cancel</button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-forest">{activeWorkspace.name}</p>
              <p className="text-xs text-sage-400 mt-0.5 capitalize">Your role: {activeWorkspace.role}</p>
            </div>
            {isOwner && <button className="btn-ghost" onClick={() => setRenaming(true)}>Rename</button>}
          </div>
        )}
      </div>

      {/* Invite */}
      {isOwner && (
        <div className="card">
          <h2 className="section-title mb-4">Invite team member</h2>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sage-400" />
              <input
                className="input pl-9"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendInvite()}
              />
            </div>
            <button className="btn-primary" onClick={sendInvite} disabled={!inviteEmail.trim() || inviteBusy}>
              {inviteBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Invite
            </button>
          </div>
          {inviteMsg && (
            <div className="mt-3">
              <StatusMsg ok={inviteMsg.ok} msg={inviteMsg.text} />
            </div>
          )}
        </div>
      )}

      {/* Members */}
      <div className="card">
        <h2 className="section-title mb-4">
          Team members <span className="text-sage-400 font-normal">({data?.members.length ?? '…'})</span>
        </h2>
        {loading ? (
          <div className="py-6 text-center text-sm text-sage-400">Loading…</div>
        ) : (
          <div className="divide-y divide-sage-50">
            {data?.members.map(m => (
              <div key={m.userId} className="flex items-center gap-3 py-3">
                <div className="w-8 h-8 rounded-full bg-forest flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-white">{initialsOf(m.name)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-forest truncate">{m.name}</p>
                    {m.role === 'owner' && <Crown className="w-3 h-3 text-amber-500" />}
                  </div>
                  <p className="text-xs text-sage-400">{m.email}</p>
                </div>
                <span className={`text-[10px] font-medium px-2.5 py-1 rounded-full ${ROLE_COLORS[m.role]}`}>
                  {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                </span>
                {isOwner && m.userId !== user?.id && (
                  <button onClick={() => removeMember(m.userId)} className="p-1.5 rounded-lg hover:bg-red-50 text-sage-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {data && data.pendingInvites.length > 0 && (
          <div className="mt-4 pt-4 border-t border-sage-100">
            <p className="text-xs font-semibold text-sage-500 mb-2">Pending invites</p>
            {data.pendingInvites.map(inv => (
              <div key={inv.email} className="flex items-center justify-between py-2 text-sm">
                <span className="text-sage-700">{inv.email}</span>
                <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">Pending</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger zone */}
      {isOwner && (
        <div className="card border-red-100">
          <h2 className="section-title mb-2 text-red-600">Danger zone</h2>
          <p className="text-xs text-sage-500 mb-3">Deleting a workspace permanently removes all of its contacts, campaigns, domains, email accounts, and automations. This cannot be undone.</p>
          <button onClick={deleteWorkspace} className="btn-ghost text-red-600 hover:bg-red-50 border-red-200">
            <Trash2 className="w-4 h-4" />Delete this workspace
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Billing tab ──────────────────────────────────────────────────────────────

interface BillingStatus {
  plan: string
  planName: string
  price: number
  interval: string | null
  expired: boolean
  trialEnd: string | null
  daysLeft: number | null
  contacts: { used: number; limit: number | null }
  emails:   { used: number; limit: number | null }
}

const PLAN_COLORS: Record<string, string> = {
  free_trial: 'bg-amber-50 text-amber-700 border-amber-200',
  pro:        'bg-[#f0f7f2] text-[#2d5a3d] border-[#c8e6d0]',
  max:        'bg-violet-50 text-violet-700 border-violet-200',
  agency:     'bg-orange-50 text-orange-700 border-orange-200',
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct     = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const isWarn  = pct > 80
  const isCrit  = pct >= 100
  const unlimited = limit === null
  return (
    <div className="bg-sage-50 rounded-xl p-3 border border-sage-100">
      <p className="text-[10px] text-sage-500 font-medium mb-1">{label}</p>
      <p className="text-sm font-bold text-forest mb-1.5">
        {used.toLocaleString()}
        <span className="text-xs font-normal text-sage-400">
          {unlimited ? ' / ∞' : ` / ${limit!.toLocaleString()}`}
        </span>
      </p>
      {!unlimited && (
        <div className="h-1.5 bg-sage-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isCrit ? 'bg-red-500' : isWarn ? 'bg-orange-400' : 'bg-forest'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {unlimited && <div className="h-1.5 bg-forest/20 rounded-full" />}
    </div>
  )
}

function BillingTab() {
  const navigate = useNavigate()
  const { data: billing, loading, reload } = useData<BillingStatus>('/api/billing/status')

  if (loading || !billing) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-forest" />
      </div>
    )
  }

  const isUnlimited = billing.contacts.limit === null
  const planBadge   = PLAN_COLORS[billing.plan] ?? PLAN_COLORS.free_trial

  return (
    <div className="space-y-4">
      {/* Trial expiry banner */}
      {billing.plan === 'free_trial' && !billing.expired && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <Crown className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-800 flex-1">
            <span className="font-semibold">Free trial</span> — {billing.daysLeft ?? 0} day{billing.daysLeft !== 1 ? 's' : ''} remaining. Upgrade before your trial ends to keep sending.
          </p>
          <button
            onClick={() => navigate('/pricing')}
            className="shrink-0 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            Upgrade now
          </button>
        </div>
      )}

      {/* Expired banner */}
      {billing.expired && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-xs text-red-800 flex-1 font-medium">Your free trial has expired. Upgrade to restore full access.</p>
          <button
            onClick={() => navigate('/pricing')}
            className="shrink-0 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            Choose a plan
          </button>
        </div>
      )}

      {/* Current plan */}
      <div className="card">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <h2 className="section-title">Current plan</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${planBadge}`}>
                {billing.planName}
              </span>
            </div>
            <p className="text-xs text-sage-400">
              {billing.interval === 'lifetime'
                ? 'Lifetime access — no renewal needed'
                : billing.interval === 'monthly'
                ? `$${billing.price}/month — renews monthly`
                : billing.trialEnd
                ? `Trial ends ${new Date(billing.trialEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                : 'Free trial'}
            </p>
          </div>
          {billing.plan !== 'agency' && (
            <button
              onClick={() => navigate('/pricing')}
              className="btn-primary text-xs flex items-center gap-1.5"
            >
              <Crown className="w-3.5 h-3.5" />
              {billing.plan === 'free_trial' ? 'Upgrade plan' : 'Change plan'}
            </button>
          )}
        </div>

        {/* Usage meters */}
        <div className="grid grid-cols-2 gap-3">
          <UsageBar
            label="Contacts"
            used={billing.contacts.used}
            limit={billing.contacts.limit}
          />
          <UsageBar
            label="Emails this cycle"
            used={billing.emails.used}
            limit={billing.emails.limit}
          />
        </div>

        {!isUnlimited && (
          <p className="text-[11px] text-sage-400 mt-3">
            Usage resets at the start of each billing cycle.{' '}
            <button onClick={() => navigate('/pricing')} className="text-forest font-semibold hover:underline">
              Upgrade for higher limits →
            </button>
          </p>
        )}
      </div>

      {/* Plan comparison shortcut */}
      <div className="card flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-forest mb-0.5">Compare all plans</p>
          <p className="text-xs text-sage-400">See contacts, email limits, and pricing for Pro, Max, and Agency.</p>
        </div>
        <button
          onClick={() => navigate('/pricing')}
          className="btn-secondary text-xs whitespace-nowrap"
        >
          View plans
        </button>
      </div>

      {/* Cancel (only for monthly plans) */}
      {billing.interval === 'monthly' && (
        <div className="card border-red-100">
          <h2 className="text-sm font-semibold text-red-600 mb-2">Cancel subscription</h2>
          <p className="text-xs text-sage-500 mb-4">
            Your account stays active until the end of the current billing period. After that, you'll be moved to the free tier.
          </p>
          <button className="text-xs font-semibold text-red-500 border border-red-200 hover:bg-red-50 px-4 py-2 rounded-lg transition-colors">
            Cancel subscription
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Settings() {
  const [activeTab, setActiveTab] = useState('profile')

  const tabContent: Record<string, React.ReactNode> = {
    profile:       <ProfileTab />,
    notifications: <NotificationsTab />,
    sending:       <SendingTab />,
    security:      <SecurityTab />,
    api:           <ApiTab />,
    team:          <TeamTab />,
    billing:       <BillingTab />,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your account, team, and billing preferences</p>
      </div>

      <div className="flex gap-6">
        <div className="w-48 shrink-0 space-y-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${activeTab === t.id ? 'bg-lime-active text-forest' : 'text-sage-600 hover:bg-white hover:shadow-card'}`}
            >
              <t.icon className={`w-4 h-4 ${activeTab === t.id ? 'text-forest' : 'text-sage-400'}`} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          {tabContent[activeTab]}
        </div>
      </div>
    </div>
  )
}
