import { useState, useEffect } from 'react'
import { Users, Mail, Send, BarChart2, Trash2, Edit2, Plus, X, Shield, Crown, AlertTriangle, Check } from 'lucide-react'
import { apiFetch } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: number
  name: string
  email: string
  role: string
  plan: string
  createdAt: string
  emailVerified: boolean
  contactCount: number
  campaignCount: number
  trialStartedAt?: string
}

interface Stats {
  users: number
  contacts: number
  campaigns: number
  emailsSent: number
  plans: Record<string, number>
}

const PLANS = [
  { id: 'free_trial', label: 'Free Trial' },
  { id: 'pro',        label: 'Pro ($9/mo)' },
  { id: 'max',        label: 'Max ($49/mo)' },
  { id: 'agency',     label: 'Agency / Enterprise' },
]

const PLAN_COLORS: Record<string, string> = {
  free_trial: 'bg-gray-100 text-gray-600',
  pro:        'bg-blue-50 text-blue-700',
  max:        'bg-purple-50 text-purple-700',
  agency:     'bg-amber-50 text-amber-700',
}

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-green-50 text-green-700',
  user:  'bg-gray-100 text-gray-600',
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Stats cards ─────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white border border-sage-100 rounded-xl p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ─── Create / Edit user modal ─────────────────────────────────────────────────

interface UserModalProps {
  user?: AdminUser
  onClose: () => void
  onSave: () => void
}

function UserModal({ user, onClose, onSave }: UserModalProps) {
  const editing = !!user
  const [form, setForm] = useState({
    name:     user?.name     || '',
    email:    user?.email    || '',
    password: '',
    plan:     user?.plan     || 'free_trial',
    role:     user?.role     || 'user',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      if (editing) {
        const body: Record<string, string> = { name: form.name, plan: form.plan, role: form.role }
        if (form.password) body.password = form.password
        await apiFetch(`/api/admin/users/${user!.id}`, { method: 'PATCH', json: body })
      } else {
        if (!form.name || !form.email || !form.password)
          throw new Error('Name, email, and password are required.')
        await apiFetch('/api/admin/users', { json: form })
      }
      onSave()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{editing ? 'Edit user' : 'Create user'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Full name</label>
            <input value={form.name} onChange={set('name')} placeholder="Alex Johnson" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d]" />
          </div>
          {!editing && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={set('email')} placeholder="user@example.com" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d]" />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">{editing ? 'New password (leave blank to keep)' : 'Password'}</label>
            <input type="password" value={form.password} onChange={set('password')} placeholder={editing ? '••••••••' : 'Min. 8 characters'} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Plan</label>
              <select value={form.plan} onChange={set('plan')} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d] bg-white">
                {PLANS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Role</label>
              <select value={form.role} onChange={set('role')} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d] bg-white">
                <option value="user">User</option>
                <option value="owner">Owner</option>
              </select>
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 text-sm font-semibold bg-[#2d5a3d] hover:bg-[#245030] disabled:opacity-50 text-white rounded-xl transition-colors">
              {loading ? 'Saving…' : editing ? 'Save changes' : 'Create user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ user, onClose, onDelete }: { user: AdminUser; onClose: () => void; onDelete: () => void }) {
  const [loading, setLoading] = useState(false)
  async function confirm() {
    setLoading(true)
    try { await apiFetch(`/api/admin/users/${user.id}`, { method: 'DELETE' }); onDelete() }
    catch { setLoading(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <h2 className="text-base font-semibold text-gray-900 text-center mb-1">Delete user?</h2>
        <p className="text-sm text-gray-500 text-center mb-6">
          This permanently removes <span className="font-medium text-gray-700">{user.name}</span> ({user.email}). This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
          <button onClick={confirm} disabled={loading} className="flex-1 py-2.5 text-sm font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl transition-colors">
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [users,   setUsers]   = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [modal,   setModal]   = useState<'create' | AdminUser | null>(null)
  const [delUser, setDelUser] = useState<AdminUser | null>(null)
  const [toast,   setToast]   = useState('')

  async function load() {
    setLoading(true)
    const [s, u] = await Promise.all([
      apiFetch<Stats>('/api/admin/stats'),
      apiFetch<AdminUser[]>('/api/admin/users'),
    ])
    setStats(s); setUsers(u)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function onSave() {
    setModal(null)
    load()
    showToast('Saved successfully')
  }

  function onDelete() {
    setDelUser(null)
    load()
    showToast('User deleted')
  }

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#2d5a3d]" />
            Super Admin
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage users, plans, and platform stats</p>
        </div>
        <button
          onClick={() => setModal('create')}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#2d5a3d] hover:bg-[#245030] text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add user
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users}    label="Total users"    value={stats.users}      color="bg-[#f0f7f2] text-[#2d5a3d]" />
          <StatCard icon={Mail}     label="Contacts"       value={stats.contacts}   color="bg-blue-50 text-blue-600" />
          <StatCard icon={Send}     label="Campaigns"      value={stats.campaigns}  color="bg-purple-50 text-purple-600" />
          <StatCard icon={BarChart2} label="Emails sent"   value={stats.emailsSent} color="bg-amber-50 text-amber-600" />
        </div>
      )}

      {/* Plan breakdown */}
      {stats && (
        <div className="bg-white border border-sage-100 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Users by plan</h2>
          <div className="flex flex-wrap gap-3">
            {PLANS.map(p => (
              <div key={p.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${PLAN_COLORS[p.id]}`}>
                <span>{p.label}</span>
                <span className="font-bold">{stats.plans[p.id] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="bg-white border border-sage-100 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 gap-3">
          <h2 className="text-sm font-semibold text-gray-900">All users ({filtered.length})</h2>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-64 px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d]"
          />
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contacts</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Campaigns</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#f0f7f2] flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-[#2d5a3d]">
                            {u.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 flex items-center gap-1.5">
                            {u.name}
                            {u.role === 'owner' && <Crown className="w-3 h-3 text-amber-500" />}
                          </p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${ROLE_COLORS[u.role] || ROLE_COLORS.user}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${PLAN_COLORS[u.plan] || PLAN_COLORS.free_trial}`}>
                        {PLANS.find(p => p.id === u.plan)?.label || u.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">{u.contactCount}</td>
                    <td className="px-4 py-3.5 text-gray-600">{u.campaignCount}</td>
                    <td className="px-4 py-3.5 text-gray-500 text-xs">{fmt(u.createdAt)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setModal(u)}
                          title="Edit"
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {u.role !== 'owner' && (
                          <button
                            onClick={() => setDelUser(u)}
                            title="Delete"
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === 'create' && <UserModal onClose={() => setModal(null)} onSave={onSave} />}
      {modal && modal !== 'create' && <UserModal user={modal as AdminUser} onClose={() => setModal(null)} onSave={onSave} />}
      {delUser && <DeleteConfirm user={delUser} onClose={() => setDelUser(null)} onDelete={onDelete} />}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 bg-[#2d5a3d] text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg z-50">
          <Check className="w-4 h-4" /> {toast}
        </div>
      )}
    </div>
  )
}
