import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Send, Clock, CheckCircle, XCircle, Eye, MousePointer,
  Edit, Trash2, MoreHorizontal, Loader2, AlertCircle, X,
} from 'lucide-react'
import { useData, apiFetch } from '../lib/api'
import { formatNumber } from '../lib/utils'

interface CampaignStats {
  total: number; sent: number; opened: number; clicked: number
  bounced: number; failed: number; openRate: number; clickRate: number
}

interface Campaign {
  id: number; name: string; subject: string; status: string
  fromAccountId: number | null; fromName: string
  lists: string[]; tags: string[]; scheduledAt: string | null; sentAt: string | null
  createdAt: string; updatedAt: string; stats: CampaignStats
}

const STATUS_CFG: Record<string, { label: string; icon: any; cls: string }> = {
  sent:     { label: 'Sent',     icon: CheckCircle, cls: 'bg-green-50 text-green-700' },
  scheduled:{ label: 'Scheduled',icon: Clock,       cls: 'bg-amber-50 text-amber-700' },
  draft:    { label: 'Draft',    icon: XCircle,     cls: 'bg-sage-100 text-sage-500'  },
  sending:  { label: 'Sending…', icon: Loader2,     cls: 'bg-blue-50 text-blue-600'   },
}

function SendModal({ campaign, onDone, onClose }: { campaign: Campaign; onDone: () => void; onClose: () => void }) {
  const [sending, setSending] = useState(false)
  const [result, setResult]   = useState<{ ok: boolean; message: string } | null>(null)

  async function doSend() {
    setSending(true)
    try {
      const r = await apiFetch<{ ok: boolean; message: string; recipientCount?: number }>(
        `/api/campaigns/${campaign.id}/send`, { method: 'POST' }
      )
      setResult({ ok: true, message: r.message })
      setTimeout(onDone, 2000)
    } catch(e: any) {
      setResult({ ok: false, message: e.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-sage-100">
          <h3 className="font-semibold text-sage-900">Send Campaign</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sage-100 flex items-center justify-center">
            <X className="w-4 h-4 text-sage-400" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {!result ? (
            <>
              <p className="text-sm text-sage-700">Ready to send <span className="font-semibold">"{campaign.name}"</span>?</p>
              <p className="text-xs text-sage-500">This will send immediately to all subscribed contacts matching the campaign audience.</p>
              <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
                <button onClick={doSend} disabled={sending} className="btn-primary flex-1">
                  {sending ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</> : <><Send className="w-4 h-4" />Send now</>}
                </button>
              </div>
            </>
          ) : (
            <div className={`flex items-start gap-3 rounded-xl p-4 ${result.ok ? 'bg-green-50' : 'bg-red-50'}`}>
              <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${result.ok ? 'text-green-600' : 'text-red-500'}`} />
              <p className={`text-sm ${result.ok ? 'text-green-700' : 'text-red-700'}`}>{result.message}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Campaigns() {
  const navigate = useNavigate()
  const { data: campaigns, loading, reload } = useData<Campaign[]>('/api/campaigns')

  const [search,      setSearch]      = useState('')
  const [sendTarget,  setSendTarget]  = useState<Campaign | null>(null)
  const [deleting,    setDeleting]    = useState<number | null>(null)
  const [menuOpen,    setMenuOpen]    = useState<number | null>(null)

  const list = (campaigns || []).filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  const totals = {
    sent:      list.reduce((a, c) => a + (c.stats?.sent     || 0), 0),
    openRate:  list.filter(c=>c.stats?.sent).length
      ? Math.round(list.reduce((a,c)=>a+(c.stats?.openRate||0),0) / list.filter(c=>c.stats?.sent).length)
      : 0,
    clickRate: list.filter(c=>c.stats?.sent).length
      ? Math.round(list.reduce((a,c)=>a+(c.stats?.clickRate||0),0) / list.filter(c=>c.stats?.sent).length)
      : 0,
  }

  async function deleteCampaign(id: number) {
    setDeleting(id)
    try { await apiFetch(`/api/campaigns/${id}`, { method: 'DELETE' }); reload() }
    catch(e: any) { alert(e.message) }
    finally { setDeleting(null); setMenuOpen(null) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p className="page-subtitle">Create and manage your email campaigns</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/campaigns/new')}>
          <Plus className="w-4 h-4" />New campaign
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total sent',     value: formatNumber(totals.sent),       icon: Send,          color: 'text-forest'  },
          { label: 'Avg open rate',  value: `${totals.openRate}%`,           icon: Eye,           color: 'text-blue-600' },
          { label: 'Avg click rate', value: `${totals.clickRate}%`,          icon: MousePointer,  color: 'text-coral'   },
        ].map(s => (
          <div key={s.label} className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-sage-50 flex items-center justify-center shrink-0">
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-xs text-sage-500 font-medium">{s.label}</p>
              <p className="text-xl font-bold text-forest mt-0.5">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-sage-100">
          <h2 className="section-title">All campaigns</h2>
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sage-400" />
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" className="input pl-9 py-2 text-xs" />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-5 h-5 text-forest animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Send className="w-8 h-8 text-sage-300 mb-3" />
            <p className="text-sm font-medium text-sage-600">No campaigns yet</p>
            <p className="text-xs text-sage-400 mt-1 mb-4">Create your first campaign to start sending.</p>
            <button className="btn-primary text-xs" onClick={() => navigate('/campaigns/new')}>
              <Plus className="w-3.5 h-3.5" />New campaign
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-100 bg-sage-50">
                {['Campaign','Status','Sent','Open rate','Click rate','Date',''].map(h=>(
                  <th key={h} className="px-6 py-3 text-left text-[11px] font-semibold text-sage-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-50">
              {list.map(c => {
                const cfg = STATUS_CFG[c.status] || STATUS_CFG.draft
                const Icon = cfg.icon
                const date = c.sentAt || c.scheduledAt || c.createdAt
                return (
                  <tr key={c.id} className="hover:bg-sage-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-forest">{c.name}</p>
                      <p className="text-xs text-sage-400 mt-0.5">{c.subject}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.cls}`}>
                        <Icon className={`w-3 h-3 ${c.status==='sending'?'animate-spin':''}`} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-sage-700 font-medium">
                      {c.stats?.sent > 0 ? formatNumber(c.stats.sent) : '—'}
                    </td>
                    <td className="px-6 py-4">
                      {c.stats?.openRate > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-sage-100 rounded-full overflow-hidden">
                            <div className="h-full bg-green-400 rounded-full" style={{ width:`${Math.min(c.stats.openRate,100)}%` }} />
                          </div>
                          <span className="text-xs text-sage-700 font-medium">{c.stats.openRate}%</span>
                        </div>
                      ) : <span className="text-sage-300 text-sm">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      {c.stats?.clickRate > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-sage-100 rounded-full overflow-hidden">
                            <div className="h-full bg-coral rounded-full" style={{ width:`${Math.min(c.stats.clickRate*3,100)}%` }} />
                          </div>
                          <span className="text-xs text-sage-700 font-medium">{c.stats.clickRate}%</span>
                        </div>
                      ) : <span className="text-sage-300 text-sm">—</span>}
                    </td>
                    <td className="px-6 py-4 text-xs text-sage-500">
                      {new Date(date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        {(c.status === 'draft' || c.status === 'scheduled') && (
                          <button
                            onClick={() => setSendTarget(c)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest bg-forest/10 hover:bg-forest/20 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            <Send className="w-3 h-3" />Send
                          </button>
                        )}
                        {c.status !== 'sent' && (
                          <button onClick={() => navigate(`/campaigns/${c.id}/edit`)} className="w-7 h-7 rounded-lg hover:bg-sage-100 flex items-center justify-center">
                            <Edit className="w-3.5 h-3.5 text-sage-400" />
                          </button>
                        )}
                        <div className="relative">
                          <button onClick={() => setMenuOpen(menuOpen===c.id?null:c.id)} className="w-7 h-7 rounded-lg hover:bg-sage-100 flex items-center justify-center">
                            <MoreHorizontal className="w-3.5 h-3.5 text-sage-400" />
                          </button>
                          {menuOpen === c.id && (
                            <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-xl shadow-lg border border-sage-100 overflow-hidden z-10 py-1">
                              <button
                                onClick={() => deleteCampaign(c.id)}
                                disabled={deleting === c.id}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                              >
                                {deleting===c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {sendTarget && (
        <SendModal
          campaign={sendTarget}
          onDone={() => { setSendTarget(null); reload() }}
          onClose={() => setSendTarget(null)}
        />
      )}
    </div>
  )
}
