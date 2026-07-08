import { useState, useEffect, useRef } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Send, Zap, Inbox, Users, Mail, Globe, Filter,
  FileText, Settings, LogOut, PanelLeftClose, PanelLeftOpen, ChevronDown, Crown, Shield,
  Plus, Check, Loader2, Layout,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { apiFetch } from '../../lib/api'

function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { workspaces, activeWorkspace, switchWorkspace, createWorkspace } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setCreating(false) }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function handleSwitch(id: number) {
    if (id === activeWorkspace?.id) { setOpen(false); return }
    setBusy(true)
    await switchWorkspace(id)
    // Full reload so every page refetches data scoped to the newly active workspace.
    window.location.href = '/'
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setBusy(true)
    await createWorkspace(newName.trim())
    window.location.href = '/'
  }

  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  if (collapsed) {
    return (
      <button
        onClick={() => setOpen(o => !o)}
        title={activeWorkspace?.name || 'Workspace'}
        className="w-8 h-8 rounded-lg bg-forest/10 flex items-center justify-center hover:bg-forest/20 transition-colors mx-auto"
      >
        <span className="text-[10px] font-semibold text-forest">{activeWorkspace ? initials(activeWorkspace.name) : 'JM'}</span>
      </button>
    )
  }

  return (
    <div className="relative px-4 py-3 border-b border-sage-100" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-sage-50 transition-colors group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded bg-forest/10 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-semibold text-forest">{activeWorkspace ? initials(activeWorkspace.name) : 'JM'}</span>
          </div>
          <div className="text-left min-w-0">
            <p className="text-xs font-semibold text-forest leading-none truncate">{activeWorkspace?.name || 'Loading…'}</p>
            <p className="text-[10px] text-sage-400 mt-0.5 leading-none capitalize">{activeWorkspace?.role || ''}</p>
          </div>
        </div>
        <ChevronDown className={cn('w-3.5 h-3.5 text-sage-400 group-hover:text-sage-600 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-4 right-4 top-full mt-1.5 bg-white border border-sage-100 rounded-xl shadow-lg z-30 overflow-hidden">
          <div className="max-h-64 overflow-y-auto py-1.5">
            {workspaces.map(w => (
              <button
                key={w.id}
                onClick={() => handleSwitch(w.id)}
                disabled={busy}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-sage-50 transition-colors text-left disabled:opacity-50"
              >
                <div className="w-6 h-6 rounded bg-forest/10 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-semibold text-forest">{initials(w.name)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-sage-900 truncate">{w.name}</p>
                  <p className="text-[10px] text-sage-400 capitalize">{w.role}</p>
                </div>
                {w.isActive && <Check className="w-3.5 h-3.5 text-forest shrink-0" />}
              </button>
            ))}
          </div>
          <div className="border-t border-sage-100 p-2">
            {creating ? (
              <form onSubmit={handleCreate} className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Workspace name"
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-sage-200 rounded-lg outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest"
                />
                <button type="submit" disabled={busy || !newName.trim()} className="p-1.5 rounded-lg bg-forest text-white disabled:opacity-50 shrink-0">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-forest hover:bg-sage-50 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Create workspace
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const navItems = [
  { to: '/',           icon: LayoutDashboard, label: 'Overview'      },
  { to: '/campaigns',  icon: Send,            label: 'Campaigns'     },
  { to: '/automation', icon: Zap,             label: 'Automation'    },
  { to: '/inbox',      icon: Inbox,           label: 'Unified Inbox' },
  { to: '/contacts',   icon: Users,           label: 'Contacts'      },
  { to: '/segments',   icon: Filter,          label: 'Segments'      },
  { to: '/accounts',   icon: Mail,            label: 'Email Accounts'},
  { to: '/domains',    icon: Globe,           label: 'Domains'       },
  { to: '/templates',  icon: FileText,        label: 'Templates'     },
  { to: '/forms',      icon: Layout,          label: 'Forms & Pages' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [trialDays, setTrialDays] = useState<number | null>(null)
  const location  = useLocation()
  const navigate  = useNavigate()
  const { user, signOut } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const planId = activeWorkspace?.plan || 'free_trial'

  const initials = (user?.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  useEffect(() => {
    if (!activeWorkspace) return
    apiFetch<{ plan: string; daysLeft: number | null }>('/api/billing/status').then(r => {
      if (!('error' in r)) setTrialDays(r.daysLeft ?? null)
    }).catch(() => {})
  }, [activeWorkspace?.id])

  async function handleSignOut() {
    await signOut()
    navigate('/signin', { replace: true })
  }

  const linkClass = (isActive: boolean) => cn(
    'flex items-center rounded-lg text-sm font-medium transition-colors duration-150 w-full',
    collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
    isActive
      ? 'bg-lime-active text-forest'
      : 'text-sage-600 hover:bg-sage-50 hover:text-sage-900'
  )

  const iconClass = (isActive: boolean) => cn(
    'w-4 h-4 shrink-0',
    isActive ? 'text-forest' : 'text-sage-400'
  )

  return (
    <aside className={cn(
      'min-h-screen bg-white border-r border-sage-100 flex flex-col shrink-0 transition-all duration-200 ease-in-out',
      collapsed ? 'w-16' : 'w-[260px]'
    )}>
      {/* Logo row — aligned to TopBar height */}
      <div className={cn(
        'h-[60px] flex items-center border-b border-sage-100 shrink-0',
        collapsed ? 'justify-center px-0' : 'px-4 justify-between'
      )}>
        {collapsed ? (
          <button
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            className="w-8 h-8 bg-forest rounded-lg flex items-center justify-center hover:opacity-80 transition-opacity"
          >
            <Mail className="w-4 h-4 text-white" />
          </button>
        ) : (
          <>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
              title="Go to dashboard"
            >
              <div className="w-8 h-8 bg-forest rounded-lg flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-white" />
              </div>
              <span className="text-[17px] font-semibold text-forest tracking-tight">KeepMailing</span>
            </button>
            <button
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              className="p-1.5 rounded-md hover:bg-sage-100 text-sage-400 hover:text-sage-600 transition-colors"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Workspace selector */}
      <WorkspaceSwitcher collapsed={collapsed} />

      {/* Expand button when collapsed */}
      {collapsed && (
        <div className="px-2 py-3 border-b border-sage-100 flex justify-center">
          <button
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            className="p-1.5 rounded-md hover:bg-sage-100 text-sage-400 hover:text-sage-600 transition-colors"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className={cn('flex-1 py-4 space-y-0.5 overflow-y-auto', collapsed ? 'px-2' : 'px-3')}>
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={linkClass(isActive)}
            >
              <Icon className={iconClass(isActive)} />
              {!collapsed && label}
            </NavLink>
          )
        })}

        {/* Admin panel — owner only */}
        {user?.role === 'owner' && (() => {
          const isActive = location.pathname === '/admin'
          return (
            <NavLink to="/admin" title={collapsed ? 'Admin Panel' : undefined} className={linkClass(isActive)}>
              <Shield className={iconClass(isActive)} />
              {!collapsed && 'Admin Panel'}
            </NavLink>
          )
        })()}
      </nav>

      {/* Bottom section */}
      <div className={cn('pb-4 space-y-0.5 border-t border-sage-100 pt-3', collapsed ? 'px-2' : 'px-3')}>
        {/* Trial upgrade prompt — expanded only */}
        {!collapsed && planId === 'free_trial' && (
          <button
            onClick={() => navigate('/pricing')}
            className="w-full mb-2 flex items-center gap-2 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-xl px-3 py-2.5 transition-colors"
          >
            <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <div className="text-left flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-amber-800 leading-none">Free Trial</p>
              <p className="text-[10px] text-amber-600 mt-0.5 leading-none">
                {trialDays !== null ? `${trialDays}d remaining · ` : ''}Upgrade →
              </p>
            </div>
          </button>
        )}
        {/* Collapsed trial icon */}
        {collapsed && planId === 'free_trial' && (
          <button
            onClick={() => navigate('/pricing')}
            title="Upgrade plan"
            className="flex justify-center p-2.5 w-full rounded-lg hover:bg-amber-50 transition-colors mb-1"
          >
            <Crown className="w-4 h-4 text-amber-500" />
          </button>
        )}

        {/* Settings */}
        <NavLink
          to="/settings"
          title={collapsed ? 'Settings' : undefined}
          className={linkClass(location.pathname === '/settings')}
        >
          <Settings className={iconClass(location.pathname === '/settings')} />
          {!collapsed && 'Settings'}
        </NavLink>

        {/* User info — only when expanded */}
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-2.5 mt-1 rounded-lg bg-sage-50/60">
            <div className="w-7 h-7 rounded-full bg-forest flex items-center justify-center shrink-0">
              <span className="text-[11px] font-semibold text-white">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-forest leading-none truncate">{user?.name}</p>
              <p className="text-[10px] text-sage-400 mt-0.5 leading-none truncate">{user?.email}</p>
            </div>
          </div>
        )}

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          title={collapsed ? 'Sign out' : undefined}
          className={cn(
            'flex items-center rounded-lg text-sm font-medium transition-colors duration-150 w-full text-red-500 hover:bg-red-50 hover:text-red-600 mt-1',
            collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  )
}
