import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, Building, MapPin, Globe, Calendar, Edit3,
  Loader2, Send, Eye, MousePointer, XCircle, Zap, FlaskConical,
} from 'lucide-react'
import { useData, apiFetch } from '../lib/api'
import { ContactModal, type Contact } from './Contacts'

interface CampaignActivity {
  campaignId: number; campaignName: string; subject: string
  sentAt: string | null; openedAt: string | null; clickedAt: string | null
  failedAt: string | null; variantId: 'a' | 'b' | null
}
interface AutomationActivity {
  automationId: number; automationName: string; status: string; enrolledAt: string
}
interface ActivityResponse {
  contact: Contact
  campaigns: CampaignActivity[]
  automations: AutomationActivity[]
}

const STATUS_CFG = {
  subscribed:   { label: 'Subscribed',   cls: 'bg-green-50 text-green-700' },
  unsubscribed: { label: 'Unsubscribed', cls: 'bg-red-50 text-red-600'     },
  bounced:      { label: 'Bounced',      cls: 'bg-amber-50 text-amber-700' },
}
const AUTOMATION_STATUS_CFG: Record<string, string> = {
  active:    'bg-blue-50 text-blue-600',
  completed: 'bg-green-50 text-green-700',
  exited:    'bg-sage-100 text-sage-500',
}

function initials(c: Contact) {
  return ((c.firstName || '').charAt(0) + (c.lastName || '').charAt(0)).toUpperCase() || c.email.charAt(0).toUpperCase()
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function CampaignRow({ a }: { a: CampaignActivity }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-sage-50 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-forest truncate">{a.campaignName}</p>
          {a.variantId && (
            <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
              <FlaskConical className="w-2.5 h-2.5" />{a.variantId.toUpperCase()}
            </span>
          )}
        </div>
        <p className="text-xs text-sage-400 truncate mt-0.5">{a.subject}</p>
        <p className="text-[10px] text-sage-400 mt-1">{a.sentAt ? `Sent ${fmtDate(a.sentAt)}` : a.failedAt ? `Failed ${fmtDate(a.failedAt)}` : 'Pending'}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {a.failedAt ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600"><XCircle className="w-2.5 h-2.5" />Failed</span>
        ) : (
          <>
            {a.openedAt && <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600"><Eye className="w-2.5 h-2.5" />Opened</span>}
            {a.clickedAt && <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-coral/10 text-coral"><MousePointer className="w-2.5 h-2.5" />Clicked</span>}
            {!a.openedAt && !a.clickedAt && a.sentAt && <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-sage-100 text-sage-500"><Send className="w-2.5 h-2.5" />Sent</span>}
          </>
        )}
      </div>
    </div>
  )
}

function AutomationRow({ a }: { a: AutomationActivity }) {
  const cls = AUTOMATION_STATUS_CFG[a.status] || 'bg-sage-100 text-sage-500'
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-sage-50 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-forest truncate">{a.automationName}</p>
        <p className="text-[10px] text-sage-400 mt-0.5">Enrolled {fmtDate(a.enrolledAt)}</p>
      </div>
      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 capitalize ${cls}`}>
        <Zap className="w-2.5 h-2.5" />{a.status}
      </span>
    </div>
  )
}

export default function ContactDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, loading, reload } = useData<ActivityResponse>(`/api/contacts/${id}/activity`)
  const [showEdit, setShowEdit] = useState(false)

  if (loading) return (
    <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-forest animate-spin" /></div>
  )
  if (!data) return (
    <div className="text-center py-16">
      <p className="text-sm font-medium text-sage-600">Contact not found</p>
      <button onClick={() => navigate('/contacts')} className="btn-ghost text-xs mt-3"><ArrowLeft className="w-3.5 h-3.5" />Back to contacts</button>
    </div>
  )

  const { contact: c, campaigns, automations } = data
  const s = STATUS_CFG[c.status]
  const opened = campaigns.filter(a => a.openedAt).length
  const clicked = campaigns.filter(a => a.clickedAt).length

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/contacts')} className="inline-flex items-center gap-1.5 text-xs font-medium text-sage-500 hover:text-sage-700">
        <ArrowLeft className="w-3.5 h-3.5" />Back to contacts
      </button>

      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-forest flex items-center justify-center shrink-0">
              <span className="text-lg font-semibold text-white">{initials(c)}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-forest">{c.firstName} {c.lastName}</h1>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
              </div>
              <p className="text-sm text-sage-500 mt-0.5">{c.email}</p>
              {c.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {c.tags.map(t => <span key={t} className="text-[10px] font-medium bg-sage-100 text-sage-600 rounded-full px-2 py-0.5">{t}</span>)}
                </div>
              )}
            </div>
          </div>
          <button onClick={() => setShowEdit(true)} className="btn-ghost text-xs shrink-0"><Edit3 className="w-3.5 h-3.5" />Edit</button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-sage-100">
          {[
            { icon: Phone, label: 'Phone', value: c.phone || '—' },
            { icon: Building, label: 'Company', value: c.company || '—' },
            { icon: MapPin, label: 'Location', value: c.location || '—' },
            { icon: Globe, label: 'Website', value: c.website || '—' },
          ].map(f => (
            <div key={f.label} className="flex items-start gap-2">
              <f.icon className="w-3.5 h-3.5 text-sage-300 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-sage-400">{f.label}</p>
                <p className="text-xs text-sage-700 truncate">{f.value}</p>
              </div>
            </div>
          ))}
        </div>
        {c.notes && (
          <div className="mt-4 pt-4 border-t border-sage-100">
            <p className="text-[10px] text-sage-400 mb-1">Notes</p>
            <p className="text-xs text-sage-600 whitespace-pre-wrap">{c.notes}</p>
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-4 pt-4 border-t border-sage-100 text-[11px] text-sage-400">
          <Calendar className="w-3 h-3" />Added {fmtDate(c.added)}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Campaigns received', value: campaigns.length, icon: Send, color: 'text-forest' },
          { label: 'Opened',             value: opened,           icon: Eye,  color: 'text-blue-600' },
          { label: 'Clicked',            value: clicked,          icon: MousePointer, color: 'text-coral' },
        ].map(s => (
          <div key={s.label} className="card flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sage-50 flex items-center justify-center shrink-0"><s.icon className={`w-4 h-4 ${s.color}`} /></div>
            <div><p className="text-[11px] text-sage-500 font-medium">{s.label}</p><p className="text-lg font-bold text-forest mt-0.5">{s.value}</p></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="section-title mb-1">Campaign activity</h2>
          <p className="text-xs text-sage-400 mb-2">Every campaign this contact has been sent</p>
          {campaigns.length === 0 ? (
            <p className="text-xs text-sage-400 py-6 text-center">No campaigns sent to this contact yet.</p>
          ) : campaigns.map(a => <CampaignRow key={`${a.campaignId}-${a.sentAt}`} a={a} />)}
        </div>
        <div className="card">
          <h2 className="section-title mb-1">Automation history</h2>
          <p className="text-xs text-sage-400 mb-2">Automations this contact has been enrolled in</p>
          {automations.length === 0 ? (
            <p className="text-xs text-sage-400 py-6 text-center">Not enrolled in any automation yet.</p>
          ) : automations.map(a => <AutomationRow key={`${a.automationId}-${a.enrolledAt}`} a={a} />)}
        </div>
      </div>

      {showEdit && (
        <ContactModal initial={c} onSave={() => { setShowEdit(false); reload() }} onClose={() => setShowEdit(false)} />
      )}
    </div>
  )
}
