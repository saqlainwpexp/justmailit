import { useRef, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Bell, Gift, ChevronDown,
  Mail, Zap, User, Info, CreditCard,
  X, CheckCheck, AlertTriangle,
  Settings, ArrowUpRight, LogOut, Users,
  FileText, Filter, Globe, Loader2,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { apiFetch } from '../../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type NotifType = 'campaign' | 'automation' | 'contact' | 'system' | 'billing' | 'alert'

interface Notification {
  id: number
  type: NotifType
  title: string
  body: string
  createdAt: string
  read: boolean
  action?: { label: string; href: string } | null
}

type SearchResultType = 'contact' | 'campaign' | 'template' | 'automation' | 'segment' | 'form' | 'landing-page' | 'account'

interface SearchResult {
  type: SearchResultType
  id: number
  label: string
  sublabel: string
  href: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const TYPE_CFG: Record<
  NotifType,
  { Icon: React.FC<{ className?: string }>; bg: string; color: string }
> = {
  campaign:   { Icon: Mail,          bg: 'bg-forest/10',  color: 'text-forest'     },
  automation: { Icon: Zap,           bg: 'bg-violet-100', color: 'text-violet-600' },
  contact:    { Icon: User,          bg: 'bg-blue-100',   color: 'text-blue-600'   },
  system:     { Icon: Info,          bg: 'bg-sage-100',   color: 'text-sage-500'   },
  billing:    { Icon: CreditCard,    bg: 'bg-amber-100',  color: 'text-amber-600'  },
  alert:      { Icon: AlertTriangle, bg: 'bg-coral/10',   color: 'text-coral'      },
}

// ─── NotifItem ────────────────────────────────────────────────────────────────

function NotifItem({
  n,
  onRead,
  onDismiss,
}: {
  n: Notification
  onRead: (id: number) => void
  onDismiss: (id: number) => void
}) {
  const cfg = TYPE_CFG[n.type] || TYPE_CFG.system
  const { Icon, bg, color } = cfg

  return (
    <div
      className={`group relative flex gap-3 px-4 py-3.5 cursor-pointer transition-colors
        ${n.read ? 'hover:bg-sage-50' : 'bg-forest/[0.03] hover:bg-forest/[0.06]'}`}
      onClick={() => onRead(n.id)}
    >
      {!n.read && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-forest" />
      )}

      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-xs leading-snug ${n.read ? 'text-sage-700' : 'text-sage-900 font-semibold'}`}>
            {n.title}
          </p>
          <span className="text-[10px] text-sage-400 shrink-0 mt-0.5">{relativeTime(n.createdAt)}</span>
        </div>
        <p className="text-[11px] text-sage-500 leading-snug mt-0.5 line-clamp-2">{n.body}</p>
        {n.action && (
          <a
            href={n.action.href}
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 text-[11px] text-forest font-medium mt-1 hover:underline"
          >
            {n.action.label}
            <ArrowUpRight className="w-2.5 h-2.5" />
          </a>
        )}
      </div>

      <button
        onClick={e => { e.stopPropagation(); onDismiss(n.id) }}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-sage-200 text-sage-400
                   hover:text-sage-600 transition-all shrink-0 self-start mt-0.5"
        title="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

function NotificationsPanel({
  notifications,
  onRead,
  onDismiss,
  onMarkAll,
  onClose,
}: {
  notifications: Notification[]
  onRead: (id: number) => void
  onDismiss: (id: number) => void
  onMarkAll: () => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const unreadCount = notifications.filter(n => !n.read).length
  const visible = tab === 'all' ? notifications : notifications.filter(n => !n.read)

  return (
    <div
      className="absolute right-0 top-[calc(100%+8px)] w-[380px] bg-white rounded-xl shadow-xl
                 border border-sage-100 z-50 overflow-hidden flex flex-col"
      style={{ maxHeight: 'min(560px, calc(100vh - 80px))' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-sage-100 shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-forest" />
          <span className="text-sm font-semibold text-sage-900">Notifications</span>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold text-white bg-forest rounded-full px-1.5 py-0.5 leading-none">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={onMarkAll}
              className="flex items-center gap-1 text-[11px] text-forest hover:text-forest/70
                         font-medium px-2 py-1 rounded-md hover:bg-forest/5 transition-colors"
            >
              <CheckCheck className="w-3 h-3" />
              Mark all read
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-sage-100 text-sage-400 hover:text-sage-600 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 px-4 pt-2 pb-1 shrink-0 border-b border-sage-50">
        {(['all', 'unread'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize
              ${tab === t ? 'bg-forest/10 text-forest' : 'text-sage-500 hover:text-sage-700 hover:bg-sage-50'}`}
          >
            {t}
            {t === 'unread' && unreadCount > 0 && (
              <span className="ml-1 text-[9px] bg-coral text-white rounded-full px-1">{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      <div className="overflow-y-auto flex-1 divide-y divide-sage-50">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <div className="w-12 h-12 rounded-full bg-sage-100 flex items-center justify-center mb-3">
              <CheckCheck className="w-5 h-5 text-sage-400" />
            </div>
            <p className="text-sm font-medium text-sage-700">All caught up</p>
            <p className="text-xs text-sage-400 mt-1">
              {tab === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}
            </p>
          </div>
        ) : (
          visible.map(n => (
            <NotifItem key={n.id} n={n} onRead={onRead} onDismiss={onDismiss} />
          ))
        )}
      </div>

      <div className="border-t border-sage-100 px-4 py-2.5 flex items-center justify-between shrink-0 bg-sage-50/50">
        <a
          href="/settings"
          className="flex items-center gap-1.5 text-[11px] text-sage-500 hover:text-sage-700 transition-colors"
        >
          <Settings className="w-3 h-3" />
          Notification settings
        </a>
        <span className="text-[10px] text-sage-400">{notifications.length} total</span>
      </div>
    </div>
  )
}

const SEARCH_TYPE_CFG: Record<SearchResultType, { Icon: React.FC<{ className?: string }>; label: string }> = {
  contact:       { Icon: User,     label: 'Contact' },
  campaign:      { Icon: Mail,     label: 'Campaign' },
  template:      { Icon: FileText, label: 'Template' },
  automation:    { Icon: Zap,      label: 'Automation' },
  segment:       { Icon: Filter,   label: 'Segment' },
  form:          { Icon: FileText, label: 'Form' },
  'landing-page': { Icon: Globe,   label: 'Landing page' },
  account:       { Icon: Mail,     label: 'Email account' },
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

export default function TopBar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [panelOpen,     setPanelOpen]     = useState(false)
  const [userMenuOpen,  setUserMenuOpen]  = useState(false)
  const [pendingInvites, setPendingInvites] = useState(0)
  const bellRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  const [referralOpen, setReferralOpen] = useState(false)
  const [referral, setReferral] = useState<{ code: string; link: string; bonusDays: number; referredCount: number; bonusDaysEarned: number } | null>(null)
  const [referralLoading, setReferralLoading] = useState(false)
  const [referralCopied, setReferralCopied] = useState(false)
  const referralRef = useRef<HTMLDivElement>(null)

  function toggleReferral() {
    setReferralOpen(v => {
      const next = !v
      if (next && !referral) {
        setReferralLoading(true)
        apiFetch<typeof referral>('/api/referral').then(setReferral).catch(() => {}).finally(() => setReferralLoading(false))
      }
      return next
    })
    setPanelOpen(false); setUserMenuOpen(false)
  }

  function copyReferralLink() {
    if (!referral) return
    navigator.clipboard.writeText(referral.link)
    setReferralCopied(true)
    setTimeout(() => setReferralCopied(false), 2000)
  }

  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchOpen,    setSearchOpen]    = useState(false)
  const [activeIndex,   setActiveIndex]   = useState(0)
  const searchRef  = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ⌘K / Ctrl+K focuses search from anywhere in the app
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Debounced search
  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) { setSearchResults([]); setSearchLoading(false); return }
    setSearchLoading(true)
    const t = setTimeout(() => {
      apiFetch<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`)
        .then(r => { setSearchResults(r); setActiveIndex(0) })
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [searchQuery])

  function selectResult(r: SearchResult) {
    setSearchOpen(false); setSearchQuery(''); setSearchResults([])
    navigate(r.href)
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!searchOpen || searchResults.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, searchResults.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); selectResult(searchResults[activeIndex]) }
    else if (e.key === 'Escape') { searchInputRef.current?.blur(); setSearchOpen(false) }
  }

  const unreadCount = notifications.filter(n => !n.read).length
  const initials    = (user?.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  const loadNotifications = useCallback(() => {
    apiFetch<Notification[]>('/api/notifications')
      .then(setNotifications)
      .catch(() => {})
  }, [])

  // Load on mount, then poll every 30 s
  useEffect(() => {
    loadNotifications()
    const iv = setInterval(loadNotifications, 30_000)
    return () => clearInterval(iv)
  }, [loadNotifications])

  useEffect(() => {
    apiFetch<unknown[]>('/api/workspaces/invites/pending').then(list => setPendingInvites(list.length)).catch(() => {})
  }, [])

  // Close panels on click-outside
  useEffect(() => {
    if (!panelOpen && !userMenuOpen && !searchOpen && !referralOpen) return
    function onMouseDown(e: MouseEvent) {
      if (panelOpen && bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setPanelOpen(false)
      }
      if (userMenuOpen && userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
      if (searchOpen && searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
      if (referralOpen && referralRef.current && !referralRef.current.contains(e.target as Node)) {
        setReferralOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [panelOpen, userMenuOpen, searchOpen, referralOpen])

  function markRead(id: number) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {})
  }

  function dismiss(id: number) {
    setNotifications(prev => prev.filter(n => n.id !== id))
    apiFetch(`/api/notifications/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  function markAll() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    apiFetch('/api/notifications/mark-all-read', { method: 'POST' }).catch(() => {})
  }

  async function handleSignOut() {
    setUserMenuOpen(false)
    await signOut()
    navigate('/signin', { replace: true })
  }

  return (
    <header className="h-[60px] bg-white border-b border-sage-100 flex items-center justify-between px-6 shrink-0">
      {/* Search */}
      <div ref={searchRef} className="relative w-[280px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sage-400" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true) }}
          onFocus={() => setSearchOpen(true)}
          onKeyDown={onSearchKeyDown}
          className="w-full pl-9 pr-4 py-2 text-sm bg-sage-50 border border-sage-100 rounded-lg
                     placeholder:text-sage-400 text-sage-800 focus:outline-none focus:ring-2
                     focus:ring-forest/15 focus:border-forest/30 transition-colors"
        />
        {!searchQuery && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pointer-events-none">
            <kbd className="text-[9px] text-sage-400 bg-sage-100 border border-sage-200 rounded px-1 py-0.5 font-mono">⌘</kbd>
            <kbd className="text-[9px] text-sage-400 bg-sage-100 border border-sage-200 rounded px-1 py-0.5 font-mono">K</kbd>
          </div>
        )}
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(''); setSearchResults([]); searchInputRef.current?.focus() }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-sage-200 text-sage-400 hover:text-sage-600"
          >
            <X className="w-3 h-3" />
          </button>
        )}

        {searchOpen && searchQuery.trim().length >= 2 && (
          <div className="absolute left-0 top-[calc(100%+8px)] w-[360px] bg-white rounded-xl shadow-xl border border-sage-100 z-50 overflow-hidden">
            {searchLoading ? (
              <div className="flex items-center gap-2 px-4 py-4 text-xs text-sage-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />Searching…
              </div>
            ) : searchResults.length === 0 ? (
              <div className="px-4 py-4 text-xs text-sage-400">No results for "{searchQuery}"</div>
            ) : (
              <div className="max-h-80 overflow-y-auto py-1.5">
                {searchResults.map((r, i) => {
                  const cfg = SEARCH_TYPE_CFG[r.type]
                  return (
                    <button
                      key={`${r.type}-${r.id}`}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => selectResult(r)}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors ${i === activeIndex ? 'bg-forest/[0.06]' : 'hover:bg-sage-50'}`}
                    >
                      <cfg.Icon className="w-3.5 h-3.5 text-sage-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-sage-800 truncate">{r.label}</p>
                        <p className="text-[10px] text-sage-400 truncate">{r.sublabel}</p>
                      </div>
                      <span className="text-[9px] text-sage-400 shrink-0">{cfg.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {pendingInvites > 0 && (
          <button
            onClick={() => navigate('/invites')}
            className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-forest/10 hover:bg-forest/15 text-forest text-xs font-semibold transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            {pendingInvites} invite{pendingInvites !== 1 ? 's' : ''}
          </button>
        )}
        <div ref={referralRef} className="relative">
          <button
            onClick={toggleReferral}
            title="Refer a friend"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors group
              ${referralOpen ? 'bg-forest/10' : 'hover:bg-sage-50'}`}
          >
            <Gift className={`w-4 h-4 transition-colors ${referralOpen ? 'text-forest' : 'text-sage-500 group-hover:text-sage-700'}`} />
          </button>

          {referralOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] w-[340px] bg-white rounded-xl shadow-xl border border-sage-100 z-50 overflow-hidden">
              <div className="p-4 border-b border-sage-100">
                <div className="flex items-center gap-2">
                  <Gift className="w-4 h-4 text-forest" />
                  <span className="text-sm font-semibold text-sage-900">Refer a friend</span>
                </div>
                <p className="text-[11px] text-sage-500 mt-1">
                  Share your link — you both get {referral?.bonusDays ?? 7} bonus trial days when they sign up.
                </p>
              </div>
              <div className="p-4 space-y-3">
                {referralLoading ? (
                  <div className="flex items-center gap-2 text-xs text-sage-400 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading…</div>
                ) : referral ? (
                  <>
                    <div className="flex items-center gap-2 bg-sage-50 border border-sage-100 rounded-lg px-3 py-2">
                      <code className="text-[11px] text-sage-700 flex-1 truncate">{referral.link}</code>
                      <button onClick={copyReferralLink} className="text-sage-400 hover:text-forest shrink-0 transition-colors">
                        {referralCopied ? <CheckCheck className="w-3.5 h-3.5 text-green-500" /> : <Users className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-sage-50 rounded-lg px-3 py-2 text-center">
                        <p className="text-base font-bold text-forest">{referral.referredCount}</p>
                        <p className="text-[10px] text-sage-500">Referred</p>
                      </div>
                      <div className="bg-sage-50 rounded-lg px-3 py-2 text-center">
                        <p className="text-base font-bold text-forest">{referral.bonusDaysEarned}</p>
                        <p className="text-[10px] text-sage-500">Bonus days earned</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-sage-400 py-2">Couldn't load your referral link. Try again.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bell + panel */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => { setPanelOpen(v => !v); setUserMenuOpen(false) }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors relative
              ${panelOpen ? 'bg-forest/10 text-forest' : 'hover:bg-sage-50 text-sage-500'}`}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-coral text-white
                               text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {panelOpen && (
            <NotificationsPanel
              notifications={notifications}
              onRead={markRead}
              onDismiss={dismiss}
              onMarkAll={markAll}
              onClose={() => setPanelOpen(false)}
            />
          )}
        </div>

        <div className="w-px h-5 bg-sage-200 mx-1" />

        {/* User menu */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => { setUserMenuOpen(v => !v); setPanelOpen(false) }}
            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors
              ${userMenuOpen ? 'bg-sage-100' : 'hover:bg-sage-50'}`}
          >
            <div className="w-7 h-7 rounded-full bg-forest flex items-center justify-center shrink-0">
              <span className="text-[11px] font-semibold text-white">{initials}</span>
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-semibold text-forest leading-none">{user?.name || 'User'}</p>
              <p className="text-[10px] text-sage-400 leading-none mt-0.5 capitalize">{user?.role || 'member'}</p>
            </div>
            <ChevronDown className={`w-3 h-3 text-sage-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] w-52 bg-white rounded-xl shadow-lg border border-sage-100 overflow-hidden z-50 py-1">
              <div className="px-4 py-3 border-b border-sage-100">
                <p className="text-xs font-semibold text-sage-900 truncate">{user?.name}</p>
                <p className="text-[11px] text-sage-400 truncate mt-0.5">{user?.email}</p>
              </div>
              <button
                onClick={() => { setUserMenuOpen(false); navigate('/settings') }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-sage-700 hover:bg-sage-50 transition-colors"
              >
                <Settings className="w-3.5 h-3.5 text-sage-400" />
                Settings
              </button>
              <div className="h-px bg-sage-100 mx-2 my-1" />
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
