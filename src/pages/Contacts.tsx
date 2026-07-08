import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Upload, Tag, MoreHorizontal, Mail, X,
  Check, Phone, Building, MapPin, Globe, Calendar, Trash2,
  Download, Edit3, UserPlus, Loader2, AlertCircle, CheckCircle,
} from 'lucide-react'
import { useData, apiFetch } from '../lib/api'

export interface Contact {
  id: number; firstName: string; lastName: string; email: string
  company: string; phone: string; location: string; website: string
  tags: string[]; status: 'subscribed'|'unsubscribed'|'bounced'
  lists: string[]; added: string; lastEmailed: string|null; notes: string
}

type ContactForm = Omit<Contact,'id'|'added'|'lastEmailed'>

const TAG_COLORS: Record<string,string> = {
  'warm-lead':'bg-green-50 text-green-700','cold':'bg-blue-50 text-blue-700',
  'vip':'bg-amber-50 text-amber-700','enterprise':'bg-purple-50 text-purple-700',
  'follow-up':'bg-coral/10 text-coral','agency':'bg-pink-50 text-pink-700',
}
const STATUS_CFG = {
  subscribed:   { label:'Subscribed',   cls:'bg-green-50 text-green-700' },
  unsubscribed: { label:'Unsubscribed', cls:'bg-red-50 text-red-600'     },
  bounced:      { label:'Bounced',      cls:'bg-amber-50 text-amber-700' },
}
const AVATAR_COLORS = ['bg-forest','bg-purple-600','bg-blue-600','bg-amber-600','bg-coral','bg-pink-600']
function avatarColor(id:number) { return AVATAR_COLORS[id%AVATAR_COLORS.length] }
function initials(c:Contact) { return ((c.firstName||'').charAt(0)+(c.lastName||'').charAt(0)).toUpperCase()||c.email.charAt(0).toUpperCase() }
const EMPTY:ContactForm = { firstName:'',lastName:'',email:'',company:'',phone:'',location:'',website:'',notes:'',tags:[],lists:[],status:'subscribed' }

// ── Inline tag pill ────────────────────────────────────────────────────────────
function TagPill({ tag }: { tag:string }) {
  const cls = TAG_COLORS[tag] || 'bg-sage-100 text-sage-600'
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cls}`}>{tag}</span>
}

// ── More menu ──────────────────────────────────────────────────────────────────
function MoreMenu({ onEdit, onDelete }: { onEdit:()=>void; onDelete:()=>void }) {
  const [open,setOpen]=useState(false)
  const ref=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!open)return
    const h=(e:MouseEvent)=>{ if(!ref.current?.contains(e.target as Node))setOpen(false) }
    document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h)
  },[open])
  return (
    <div ref={ref} className="relative">
      <button onClick={()=>setOpen(v=>!v)} className="w-7 h-7 rounded-lg hover:bg-sage-100 flex items-center justify-center">
        <MoreHorizontal className="w-4 h-4 text-sage-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-xl shadow-lg border border-sage-100 overflow-hidden z-20 py-1">
          <button onClick={()=>{setOpen(false);onEdit()}}   className="w-full flex items-center gap-2 px-3 py-2 text-xs text-sage-700 hover:bg-sage-50"><Edit3 className="w-3.5 h-3.5"/>Edit</button>
          <button onClick={()=>{setOpen(false);onDelete()}} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5"/>Delete</button>
        </div>
      )}
    </div>
  )
}

// ── Contact Modal ──────────────────────────────────────────────────────────────
export function ContactModal({ initial, onSave, onClose }: { initial?:Contact; onSave:(c:Contact)=>void; onClose:()=>void }) {
  const [form,setForm]=useState<ContactForm>(initial ? {
    firstName:initial.firstName,lastName:initial.lastName,email:initial.email,
    company:initial.company,phone:initial.phone,location:initial.location,
    website:initial.website,notes:initial.notes,tags:[...initial.tags],
    lists:[...initial.lists],status:initial.status,
  } : {...EMPTY})
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [tagInput,setTagInput]=useState('')

  async function submit(e:React.FormEvent) {
    e.preventDefault(); setError('')
    if(!form.email) return setError('Email is required.')
    setSaving(true)
    try {
      let c:Contact
      if (initial) c=await apiFetch<Contact>(`/api/contacts/${initial.id}`,{method:'PUT',json:form})
      else         c=await apiFetch<Contact>('/api/contacts',{json:form})
      onSave(c)
    } catch(e:any){ setError(e.message) } finally { setSaving(false) }
  }

  function addTag(t:string){
    const tag=t.trim().toLowerCase().replace(/\s+/g,'-')
    if(tag&&!form.tags.includes(tag)) setForm(f=>({...f,tags:[...f.tags,tag]}))
    setTagInput('')
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-sage-100 sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-sage-900">{initial?'Edit contact':'Add contact'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sage-100 flex items-center justify-center"><X className="w-4 h-4 text-sage-400"/></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3"><AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5"/><p className="text-xs text-red-700">{error}</p></div>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">First name</label><input className="input" value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:e.target.value}))}/></div>
            <div><label className="label">Last name</label><input className="input" value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:e.target.value}))}/></div>
          </div>
          <div><label className="label">Email *</label><input className="input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
          <div><label className="label">Company</label><input className="input" value={form.company} onChange={e=>setForm(f=>({...f,company:e.target.value}))}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
            <div><label className="label">Location</label><input className="input" value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))}/></div>
          </div>
          <div><label className="label">Website</label><input className="input" value={form.website} onChange={e=>setForm(f=>({...f,website:e.target.value}))}/></div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value as any}))}>
              <option value="subscribed">Subscribed</option>
              <option value="unsubscribed">Unsubscribed</option>
              <option value="bounced">Bounced</option>
            </select>
          </div>
          <div>
            <label className="label">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.tags.map(t=>(
                <span key={t} className="inline-flex items-center gap-1 text-[10px] bg-sage-100 text-sage-700 rounded-full px-2 py-0.5">
                  {t}<button type="button" onClick={()=>setForm(f=>({...f,tags:f.tags.filter(x=>x!==t)}))} className="hover:text-red-500"><X className="w-2.5 h-2.5"/></button>
                </span>
              ))}
            </div>
            <input className="input" placeholder="Add tag (press Enter)" value={tagInput}
              onChange={e=>setTagInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();addTag(tagInput)} }}
            />
          </div>
          <div><label className="label">Notes</label><textarea className="input resize-none" rows={3} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving?<><Loader2 className="w-4 h-4 animate-spin"/>Saving…</>:<><Check className="w-4 h-4"/>{initial?'Save changes':'Add contact'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Import Modal ───────────────────────────────────────────────────────────────

interface TargetField { key: string; label: string; required?: boolean }
const TARGET_FIELDS: TargetField[] = [
  { key: 'email',     label: 'Email', required: true },
  { key: 'firstName', label: 'First name' },
  { key: 'lastName',  label: 'Last name' },
  { key: 'company',   label: 'Company' },
  { key: 'phone',     label: 'Phone' },
  { key: 'location',  label: 'Location' },
  { key: 'website',   label: 'Website' },
  { key: 'tags',      label: 'Tags (semicolon-separated)' },
  { key: 'lists',     label: 'Lists (semicolon-separated)' },
  { key: 'notes',     label: 'Notes' },
]
const FIELD_GUESSES: Record<string, string[]> = {
  email: ['email', 'email address', 'e-mail', 'emailaddress'],
  firstName: ['first name', 'firstname', 'first'],
  lastName: ['last name', 'lastname', 'last', 'surname'],
  company: ['company', 'organization', 'organisation'],
  phone: ['phone', 'mobile', 'phone number'],
  location: ['location', 'city'],
  website: ['website', 'url'],
  tags: ['tags', 'tag'],
  lists: ['list', 'lists'],
  notes: ['notes', 'note'],
}
function guessMapping(headers: string[]): Record<string,string> {
  const norm = (s:string) => s.trim().toLowerCase()
  const mapping: Record<string,string> = {}
  for (const field of TARGET_FIELDS) {
    const guesses = FIELD_GUESSES[field.key] || []
    const match = headers.find(h => guesses.includes(norm(h)))
    if (match) mapping[field.key] = match
  }
  return mapping
}

function ImportModal({ onDone, onClose }: { onDone:()=>void; onClose:()=>void }) {
  const [step,setStep]=useState<'upload'|'mapping'|'result'>('upload')
  const [csv,setCsv]=useState('')
  const [headers,setHeaders]=useState<string[]>([])
  const [sampleRows,setSampleRows]=useState<string[][]>([])
  const [rowCount,setRowCount]=useState(0)
  const [mapping,setMapping]=useState<Record<string,string>>({})
  const [loading,setLoading]=useState(false)
  const [result,setResult]=useState<{added:number;skipped:number;total:number}|null>(null)
  const [error,setError]=useState('')
  const fileRef=useRef<HTMLInputElement>(null)

  function onFile(e:React.ChangeEvent<HTMLInputElement>) {
    const f=e.target.files?.[0]; if(!f)return
    const r=new FileReader(); r.onload=ev=>setCsv(ev.target?.result as string); r.readAsText(f)
  }

  async function doPreview() {
    if(!csv.trim())return setError('Paste CSV or upload a file.')
    setLoading(true); setError('')
    try {
      const r=await apiFetch<{headers:string[];sampleRows:string[][];rowCount:number}>('/api/contacts/import/preview',{json:{csv}})
      setHeaders(r.headers); setSampleRows(r.sampleRows); setRowCount(r.rowCount)
      setMapping(guessMapping(r.headers))
      setStep('mapping')
    } catch(e:any){ setError(e.message) } finally { setLoading(false) }
  }

  async function doImport() {
    if(!mapping.email) return setError('You must map a column to Email.')
    setLoading(true); setError('')
    try { const r=await apiFetch<any>('/api/contacts/import',{json:{csv,mapping}}); setResult(r); setStep('result') }
    catch(e:any){ setError(e.message) } finally { setLoading(false) }
  }

  const headerIndex = (h:string) => headers.indexOf(h)

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-sage-100 sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-sage-900">Import contacts</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sage-100 flex items-center justify-center"><X className="w-4 h-4 text-sage-400"/></button>
        </div>
        <div className="p-5 space-y-4">
          {step === 'upload' && (
            <>
              <p className="text-xs text-sage-500">Upload any CSV — you'll map its columns to contact fields next, and only rows with a valid email get imported.</p>
              <button onClick={()=>fileRef.current?.click()} className="w-full border-2 border-dashed border-sage-200 rounded-xl py-8 flex flex-col items-center gap-2 hover:border-forest/40 hover:bg-forest/[0.02] transition-all">
                <Upload className="w-6 h-6 text-sage-400"/>
                <p className="text-sm text-sage-500">Click to upload CSV</p>
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile}/>
              <textarea className="input resize-none font-mono text-xs" rows={6} placeholder="Or paste CSV here…" value={csv} onChange={e=>setCsv(e.target.value)}/>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-3">
                <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
                <button onClick={doPreview} disabled={loading||!csv.trim()} className="btn-primary flex-1">
                  {loading?<><Loader2 className="w-4 h-4 animate-spin"/>Reading…</>:<>Continue</>}
                </button>
              </div>
            </>
          )}

          {step === 'mapping' && (
            <>
              <p className="text-xs text-sage-500">{rowCount} row{rowCount!==1?'s':''} found. Map each field to a column from your CSV — unmapped fields are left blank, and unmatched columns are simply ignored.</p>
              <div className="space-y-2.5">
                {TARGET_FIELDS.map(f => (
                  <div key={f.key} className="flex items-center gap-3">
                    <label className="text-xs font-medium text-sage-700 w-40 shrink-0">
                      {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                    </label>
                    <select
                      className="input py-1.5 text-xs flex-1"
                      value={mapping[f.key] || ''}
                      onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}
                    >
                      <option value="">— Don't import —</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                    {mapping[f.key] && sampleRows[0] && (
                      <span className="text-[10px] text-sage-400 w-28 truncate shrink-0" title={sampleRows[0][headerIndex(mapping[f.key])]}>
                        e.g. "{sampleRows[0][headerIndex(mapping[f.key])] || '—'}"
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={()=>setStep('upload')} className="btn-ghost flex-1">Back</button>
                <button onClick={doImport} disabled={loading||!mapping.email} className="btn-primary flex-1">
                  {loading?<><Loader2 className="w-4 h-4 animate-spin"/>Importing…</>:<><Upload className="w-4 h-4"/>Import</>}
                </button>
              </div>
            </>
          )}

          {step === 'result' && result && (
            <div className="text-center py-4 space-y-3">
              <CheckCircle className="w-10 h-10 text-green-500 mx-auto"/>
              <p className="font-semibold text-sage-900">Import complete</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[{label:'Added',value:result.added},{label:'Skipped',value:result.skipped},{label:'Total rows',value:result.total}].map(s=>(
                  <div key={s.label} className="bg-sage-50 rounded-xl p-3">
                    <p className="text-xl font-bold text-forest">{s.value}</p>
                    <p className="text-[11px] text-sage-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-sage-400">Skipped rows were missing a valid email or already exist.</p>
              <button onClick={()=>{onDone();onClose()}} className="btn-primary w-full"><Check className="w-4 h-4"/>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Bulk tag modal ─────────────────────────────────────────────────────────────
function BulkTagModal({ ids, onDone, onClose }: { ids: number[]; onDone: () => void; onClose: () => void }) {
  const [tags, setTags] = useState('')
  const [lists, setLists] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    const addTags = tags.split(',').map(t => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean)
    const addLists = lists.split(',').map(l => l.trim()).filter(Boolean)
    if (!addTags.length && !addLists.length) return setError('Enter at least one tag or list.')
    setSaving(true); setError('')
    try {
      await apiFetch('/api/contacts/bulk-tag', { json: { ids, addTags, addLists } })
      onDone()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-sage-100">
          <h3 className="font-semibold text-sage-900">Tag {ids.length} contact{ids.length !== 1 ? 's' : ''}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sage-100 flex items-center justify-center"><X className="w-4 h-4 text-sage-400"/></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-sage-500">Existing tags/lists on these contacts are kept — this only adds new ones.</p>
          <div>
            <label className="label">Add tags (comma-separated)</label>
            <input className="input" placeholder="vip, newsletter" value={tags} onChange={e=>setTags(e.target.value)} />
          </div>
          <div>
            <label className="label">Add to lists (comma-separated)</label>
            <input className="input" placeholder="q4-promo" value={lists} onChange={e=>setLists(e.target.value)} />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button onClick={submit} disabled={saving} className="btn-primary flex-1">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin"/>Applying…</> : <><Check className="w-4 h-4"/>Apply</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function Contacts() {
  const navigate = useNavigate()
  const { data, loading, reload } = useData<{contacts:Contact[];total:number}>('/api/contacts')
  const [search,setSearch]=useState('')
  const [statusFilter,setStatusFilter]=useState('')
  const [tagFilter,setTagFilter]=useState('')
  const [showModal,setShowModal]=useState(false)
  const [showImport,setShowImport]=useState(false)
  const [showBulkTag,setShowBulkTag]=useState(false)
  const [editing,setEditing]=useState<Contact|null>(null)
  const [selected,setSelected]=useState<Set<number>>(new Set())

  const allTags = useMemo(()=>[...new Set((data?.contacts||[]).flatMap(c=>c.tags||[]))].sort(),[data])

  // Client-side search while we have data (for instant feel); server-side handles pagination
  const contacts = useMemo(()=>{
    let c=data?.contacts||[]
    if(search){const q=search.toLowerCase();c=c.filter(x=>`${x.firstName} ${x.lastName} ${x.email} ${x.company}`.toLowerCase().includes(q))}
    if(statusFilter)c=c.filter(x=>x.status===statusFilter)
    if(tagFilter)c=c.filter(x=>x.tags?.includes(tagFilter))
    return c
  },[data,search,statusFilter,tagFilter])

  async function deleteContact(id:number) {
    if(!confirm('Delete this contact?'))return
    await apiFetch(`/api/contacts/${id}`,{method:'DELETE'}); reload()
  }

  async function bulkDelete() {
    if(!confirm(`Delete ${selected.size} contacts?`))return
    await apiFetch('/api/contacts/bulk-delete',{json:{ids:[...selected]}})
    setSelected(new Set()); reload()
  }

  function exportCsv() {
    const params = new URLSearchParams()
    if (selected.size > 0) {
      params.set('ids', [...selected].join(','))
    } else {
      if (statusFilter) params.set('status', statusFilter)
      if (tagFilter) params.set('tag', tagFilter)
      if (search) params.set('search', search)
    }
    const qs = params.toString()
    window.open(`/api/contacts/export${qs ? `?${qs}` : ''}`, '_blank')
  }

  function toggleSelect(id:number) {
    setSelected(s=>{const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n})
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">{data?.total ?? 0} total contacts</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={exportCsv} title={selected.size > 0 ? `Export ${selected.size} selected contacts` : 'Export contacts (respects active filters)'}>
            <Download className="w-4 h-4"/>Export{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
          <button className="btn-ghost" onClick={()=>setShowImport(true)}><Upload className="w-4 h-4"/>Import</button>
          <button className="btn-primary" onClick={()=>{setEditing(null);setShowModal(true)}}><Plus className="w-4 h-4"/>Add contact</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sage-400"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search contacts…" className="input pl-9 py-2 text-xs"/>
        </div>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="input py-2 text-xs w-36">
          <option value="">All statuses</option>
          <option value="subscribed">Subscribed</option>
          <option value="unsubscribed">Unsubscribed</option>
          <option value="bounced">Bounced</option>
        </select>
        <select value={tagFilter} onChange={e=>setTagFilter(e.target.value)} className="input py-2 text-xs w-36">
          <option value="">All tags</option>
          {allTags.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        {selected.size > 0 && (
          <>
            <button onClick={()=>setShowBulkTag(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-forest bg-forest/5 hover:bg-forest/10 px-3 py-2 rounded-lg transition-colors">
              <Tag className="w-3.5 h-3.5"/>Tag {selected.size}
            </button>
            <button onClick={bulkDelete} className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg transition-colors">
              <Trash2 className="w-3.5 h-3.5"/>Delete {selected.size}
            </button>
          </>
        )}
      </div>
      {(statusFilter || tagFilter || search) && selected.size === 0 && (
        <p className="text-[11px] text-sage-400 -mt-4">Export will use your current filters ({contacts.length} contact{contacts.length!==1?'s':''}).</p>
      )}

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 text-forest animate-spin"/></div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <UserPlus className="w-8 h-8 text-sage-300 mb-3"/>
            <p className="text-sm font-medium text-sage-600">No contacts yet</p>
            <p className="text-xs text-sage-400 mt-1 mb-4">Add contacts manually or import a CSV.</p>
            <div className="flex gap-2">
              <button className="btn-primary text-xs" onClick={()=>setShowModal(true)}><Plus className="w-3.5 h-3.5"/>Add contact</button>
              <button className="btn-ghost text-xs" onClick={()=>setShowImport(true)}><Upload className="w-3.5 h-3.5"/>Import CSV</button>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-100 bg-sage-50">
                <th className="pl-4 py-3 w-10">
                  <input type="checkbox" checked={selected.size===contacts.length&&contacts.length>0}
                    onChange={e=>setSelected(e.target.checked?new Set(contacts.map(c=>c.id)):new Set())}
                    className="rounded border-sage-300 text-forest focus:ring-forest/20"/>
                </th>
                {['Contact','Status','Company','Tags','Added',''].map(h=>(
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-sage-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-50">
              {contacts.map(c=>{
                const s=STATUS_CFG[c.status]
                return (
                  <tr key={c.id} className="hover:bg-sage-50/50 transition-colors group">
                    <td className="pl-4 py-3">
                      <input type="checkbox" checked={selected.has(c.id)} onChange={()=>toggleSelect(c.id)} className="rounded border-sage-300 text-forest"/>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={()=>navigate(`/contacts/${c.id}`)} className="flex items-center gap-3 text-left hover:opacity-75 transition-opacity">
                        <div className={`w-8 h-8 rounded-full ${avatarColor(c.id)} flex items-center justify-center shrink-0`}>
                          <span className="text-[11px] font-semibold text-white">{initials(c)}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-forest">{c.firstName} {c.lastName}</p>
                          <p className="text-xs text-sage-400 mt-0.5">{c.email}</p>
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-sage-600">{c.company||'—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {c.tags.slice(0,3).map(t=><TagPill key={t} tag={t}/>)}
                        {c.tags.length>3&&<span className="text-[10px] text-sage-400">+{c.tags.length-3}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-sage-500">
                      {new Date(c.added).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                    </td>
                    <td className="px-4 py-3">
                      <div className="opacity-0 group-hover:opacity-100 transition-all">
                        <MoreMenu onEdit={()=>{setEditing(c);setShowModal(true)}} onDelete={()=>deleteContact(c.id)}/>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <ContactModal initial={editing||undefined} onSave={()=>{setShowModal(false);reload()}} onClose={()=>setShowModal(false)}/>
      )}
      {showImport && <ImportModal onDone={reload} onClose={()=>setShowImport(false)}/>}
      {showBulkTag && (
        <BulkTagModal
          ids={[...selected]}
          onDone={()=>{setShowBulkTag(false);setSelected(new Set());reload()}}
          onClose={()=>setShowBulkTag(false)}
        />
      )}
    </div>
  )
}
