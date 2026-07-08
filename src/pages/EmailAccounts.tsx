import { useState, useRef, useEffect } from 'react'
import {
  Plus, Mail, MoreHorizontal, Trash2, Edit3, RefreshCw,
  CheckCircle, XCircle, Loader2, AlertCircle, X, Check,
  Wifi, WifiOff, Send, TrendingUp, PlugZap,
} from 'lucide-react'
import { useData, apiFetch } from '../lib/api'

interface Account {
  id: number; name: string; email: string; fromName: string
  smtpHost: string; smtpPort: number; smtpUser: string
  smtpSecure: boolean; dailyLimit: number; sentToday: number
  totalSent: number; opens: number; clicks: number; bounces: number
  status: 'pending'|'connected'|'error'|'testing'|'disconnected'
  color: string; provider: string; createdAt: string; lastTestedAt?: string
}

const PROVIDERS = [
  { label:'Gmail',    host:'smtp.gmail.com',      port:587, note:'⚠️ Gmail requires an App Password — your regular Gmail password will NOT work.\n1. Go to myaccount.google.com → Security\n2. Enable 2-Step Verification\n3. Search "App passwords" → create one for "Mail"\n4. Use that 16-char password here (not your Gmail password)' },
  { label:'Outlook',  host:'smtp.office365.com',  port:587, note:'Use your Microsoft 365 email and password. If MFA is on, create an App Password at account.microsoft.com → Security.' },
  { label:'Mailgun',  host:'smtp.mailgun.org',    port:587, note:'Find your SMTP credentials in Mailgun dashboard → Sending → Domain Settings → SMTP credentials.' },
  { label:'SendGrid', host:'smtp.sendgrid.net',   port:587, note:'Username must be exactly "apikey". Password is your SendGrid API Key (Settings → API Keys).' },
  { label:'Custom',   host:'',                    port:587, note:'' },
]

const COLORS = ['#2d5a3d','#7c3aed','#2563eb','#d97706','#f0634a','#db2777']

const STATUS_CFG = {
  pending:      { label:'Pending',      icon:AlertCircle, cls:'bg-sage-100 text-sage-500'  },
  connected:    { label:'Connected',    icon:CheckCircle, cls:'bg-green-50 text-green-700' },
  error:        { label:'Error',        icon:XCircle,     cls:'bg-red-50 text-red-600'     },
  testing:      { label:'Testing…',     icon:Loader2,     cls:'bg-blue-50 text-blue-600'   },
  disconnected: { label:'Disconnected', icon:WifiOff,     cls:'bg-sage-100 text-sage-500'  },
}

function AccountModal({ initial, onSave, onClose }: { initial?:Account; onSave:()=>void; onClose:()=>void }) {
  const [providerLabel, setProviderLabel] = useState(initial?.provider||'Gmail')
  const [form, setForm] = useState({
    name: initial?.name||'', email: initial?.email||'', fromName: initial?.fromName||'',
    smtpHost: initial?.smtpHost||'smtp.gmail.com', smtpPort: initial?.smtpPort||587,
    smtpUser: initial?.smtpUser||'', smtpPass: '',
    smtpSecure: initial?.smtpSecure||false,
    dailyLimit: initial?.dailyLimit||500,
    color: initial?.color||COLORS[0], provider: initial?.provider||'Gmail',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function pickProvider(p: typeof PROVIDERS[number]) {
    setProviderLabel(p.label)
    setForm(f => ({ ...f, smtpHost: p.host, smtpPort: p.port, smtpSecure: p.port === 465, provider: p.label }))
  }

  function onPortChange(val: number) {
    setForm(f => ({ ...f, smtpPort: val, smtpSecure: val === 465 }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!form.name || !form.email || !form.smtpHost || !form.smtpUser)
      return setError('Name, email, SMTP host and username are required.')
    if (!initial && !form.smtpPass)
      return setError('SMTP password is required for a new account.')
    setSaving(true)
    try {
      if (initial) await apiFetch(`/api/accounts/${initial.id}`, { method:'PUT', json: form })
      else         await apiFetch('/api/accounts', { json: form })
      onSave()
    } catch(e:any) { setError(e.message) } finally { setSaving(false) }
  }

  const note = PROVIDERS.find(p=>p.label===providerLabel)?.note

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-sage-100 sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-sage-900">{initial?'Edit account':'Add email account'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sage-100 flex items-center justify-center"><X className="w-4 h-4 text-sage-400"/></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500"/>{error}</div>}

          <div>
            <label className="label">Provider</label>
            <div className="flex flex-wrap gap-2">
              {PROVIDERS.map(p=>(
                <button type="button" key={p.label} onClick={()=>pickProvider(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${providerLabel===p.label?'bg-forest text-white border-forest':'border-sage-200 text-sage-600 hover:border-forest/40'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            {note && (
              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mt-2 space-y-1">
                {note.split('\n').map((line,i)=><p key={i} className={i===0?'font-semibold':''}>{line}</p>)}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Account name</label><input className="input" placeholder="Sales" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
            <div><label className="label">From name</label><input className="input" placeholder="Sales Team" value={form.fromName} onChange={e=>setForm(f=>({...f,fromName:e.target.value}))}/></div>
          </div>
          <div><label className="label">From email address</label><input className="input" type="email" placeholder="you@yourdomain.com" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><label className="label">SMTP host</label><input className="input" value={form.smtpHost} onChange={e=>setForm(f=>({...f,smtpHost:e.target.value}))}/></div>
            <div>
              <label className="label">Port</label>
              <div className="flex gap-1.5">
                {[587,465,25].map(p=>(
                  <button type="button" key={p} onClick={()=>onPortChange(p)}
                    className={`flex-1 py-2 text-[11px] font-semibold rounded-lg border transition-all ${form.smtpPort===p?'bg-forest text-white border-forest':'border-sage-200 text-sage-600 hover:border-forest/40'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${form.smtpSecure?'bg-green-50 border-green-200':'bg-sage-50 border-sage-200'}`}>
            <div>
              <p className="text-xs font-semibold text-sage-800">SSL / TLS encryption</p>
              <p className="text-[10px] text-sage-500 mt-0.5">{form.smtpPort===465?'Required for port 465':'Not needed for port 587 (uses STARTTLS)'}</p>
            </div>
            <button type="button" onClick={()=>setForm(f=>({...f,smtpSecure:!f.smtpSecure}))}
              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${form.smtpSecure?'bg-green-500':'bg-sage-300'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.smtpSecure?'translate-x-5':''}`}/>
            </button>
          </div>

          {form.smtpPort===465&&!form.smtpSecure&&(
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-[11px] text-amber-800">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600"/>
              Port 465 requires SSL to be <strong className="mx-0.5">ON</strong>. Toggle SSL above or switch to port 587.
            </div>
          )}

          <div><label className="label">SMTP username</label><input className="input" value={form.smtpUser} onChange={e=>setForm(f=>({...f,smtpUser:e.target.value}))}/></div>
          <div><label className="label">{initial?'SMTP password (leave blank to keep current)':'SMTP password'}</label><input className="input" type="password" autoComplete="new-password" value={form.smtpPass} onChange={e=>setForm(f=>({...f,smtpPass:e.target.value}))}/></div>
          <div><label className="label">Daily sending limit</label><input className="input" type="number" min="1" max="10000" value={form.dailyLimit} onChange={e=>setForm(f=>({...f,dailyLimit:parseInt(e.target.value)||500}))}/></div>

          <div>
            <label className="label">Colour</label>
            <div className="flex gap-2">
              {COLORS.map(c=>(
                <button type="button" key={c} onClick={()=>setForm(f=>({...f,color:c}))}
                  style={{background:c}} className={`w-7 h-7 rounded-full border-2 transition-all ${form.color===c?'border-sage-700 scale-110 shadow':'border-white'}`}/>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving?<><Loader2 className="w-4 h-4 animate-spin"/>Saving…</>:<><Check className="w-4 h-4"/>{initial?'Save changes':'Add account'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Toast({ msg, ok, onClose }: { msg:string; ok:boolean; onClose:()=>void }) {
  useEffect(()=>{
    if (ok) { const t=setTimeout(onClose,4500); return()=>clearTimeout(t) }
    // errors stay until dismissed
  },[onClose, ok])
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium max-w-sm animate-in slide-in-from-bottom-2 ${ok?'bg-green-50 border-green-200 text-green-800':'bg-red-50 border-red-200 text-red-800'}`}>
      {ok?<CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5"/>:<XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5"/>}
      <span className="text-xs leading-relaxed">{msg}</span>
      <button onClick={onClose} className="ml-auto opacity-60 hover:opacity-100 shrink-0"><X className="w-3.5 h-3.5"/></button>
    </div>
  )
}

function MoreMenu({ onEdit, onDelete, onDisconnect, onReconnect, disconnected }: { onEdit:()=>void; onDelete:()=>void; onDisconnect:()=>void; onReconnect:()=>void; disconnected:boolean }) {
  const [open,setOpen]=useState(false)
  const ref=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!open)return
    const h=(e:MouseEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false)}
    document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h)
  },[open])
  return (
    <div ref={ref} className="relative">
      <button onClick={()=>setOpen(v=>!v)} className="w-7 h-7 rounded-lg hover:bg-sage-100 flex items-center justify-center"><MoreHorizontal className="w-4 h-4 text-sage-400"/></button>
      {open&&<div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-sage-100 overflow-hidden z-20 py-1">
        <button onClick={()=>{setOpen(false);onEdit()}} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-sage-700 hover:bg-sage-50"><Edit3 className="w-3.5 h-3.5"/>Edit</button>
        {disconnected ? (
          <button onClick={()=>{setOpen(false);onReconnect()}} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-forest hover:bg-forest/5"><PlugZap className="w-3.5 h-3.5"/>Reconnect</button>
        ) : (
          <button onClick={()=>{setOpen(false);onDisconnect()}} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-sage-700 hover:bg-sage-50"><WifiOff className="w-3.5 h-3.5"/>Disconnect</button>
        )}
        <button onClick={()=>{setOpen(false);onDelete()}} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5"/>Delete</button>
      </div>}
    </div>
  )
}

export default function EmailAccounts() {
  const { data: accounts, loading, reload } = useData<Account[]>('/api/accounts')
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState<Account|null>(null)
  const [testing,    setTesting]    = useState<number|null>(null)
  const [toast,      setToast]      = useState<{msg:string;ok:boolean}|null>(null)
  const [testErrors, setTestErrors] = useState<Record<number,string>>({})

  const list = accounts || []
  const connected = list.filter(a=>a.status==='connected').length
  const totalSent  = list.reduce((a,c)=>a+(c.totalSent||0),0)
  const todaySent  = list.reduce((a,c)=>a+(c.sentToday||0),0)

  async function testConnection(id: number) {
    setTesting(id)
    setTestErrors(e => { const n={...e}; delete n[id]; return n })
    try {
      const r=await apiFetch<{ok:boolean;message?:string;error?:string}>(`/api/accounts/${id}/test`,{method:'POST'})
      setToast({msg:r.ok?'SMTP connection verified!':r.error||'Connection failed',ok:!!r.ok})
      if (!r.ok && r.error) setTestErrors(e=>({...e,[id]:r.error!}))
      reload()
    } catch(e:any){
      setToast({msg:e.message,ok:false})
      setTestErrors(prev=>({...prev,[id]:e.message}))
      reload()
    } finally {setTesting(null)}
  }

  async function deleteAccount(id:number) {
    if(!confirm('Delete this account? Campaigns using it will need a new sender assigned, and its synced inbox messages will be removed from KeepMailing.'))return
    await apiFetch(`/api/accounts/${id}`,{method:'DELETE'}); reload()
  }

  async function disconnectAccount(id:number) {
    if(!confirm("Disconnect this account? Its synced emails will be removed from KeepMailing's inbox (your actual mailbox is untouched). Reconnecting will re-sync fresh."))return
    await apiFetch(`/api/accounts/${id}/disconnect`,{method:'POST'}); reload()
  }

  async function reconnectAccount(id:number) {
    await apiFetch(`/api/accounts/${id}/reconnect`,{method:'POST'}); reload()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div><h1 className="page-title">Email Accounts</h1><p className="page-subtitle">Connect SMTP accounts to send campaigns and automations</p></div>
        <button className="btn-primary" onClick={()=>{setEditing(null);setShowModal(true)}}><Plus className="w-4 h-4"/>Add account</button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          {label:'Connected',   value:`${connected}/${list.length}`,       icon:Wifi,       color:'text-green-600'},
          {label:'Sent today',  value:todaySent.toLocaleString(),           icon:Send,       color:'text-forest'},
          {label:'Total sent',  value:totalSent.toLocaleString(),           icon:TrendingUp, color:'text-blue-600'},
          {label:'Errors',      value:list.filter(a=>a.status==='error').length.toString(), icon:XCircle, color:'text-coral'},
        ].map(s=>(
          <div key={s.label} className="card flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sage-50 flex items-center justify-center shrink-0"><s.icon className={`w-4 h-4 ${s.color}`}/></div>
            <div><p className="text-[11px] text-sage-500 font-medium">{s.label}</p><p className="text-lg font-bold text-forest mt-0.5">{s.value}</p></div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 text-forest animate-spin"/></div>
      ) : list.length===0 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <Mail className="w-10 h-10 text-sage-300 mb-3"/>
          <p className="text-sm font-medium text-sage-600 mb-1">No email accounts connected</p>
          <p className="text-xs text-sage-400 mb-5 max-w-sm">Connect a Gmail, Outlook, Mailgun, or custom SMTP account to start sending campaigns.</p>
          <button className="btn-primary" onClick={()=>setShowModal(true)}><Plus className="w-4 h-4"/>Add your first account</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {list.map(a=>{
            const s=STATUS_CFG[a.status]||STATUS_CFG.pending
            const Icon=s.icon
            const isTesting=testing===a.id
            const pct=a.dailyLimit>0?Math.min(Math.round((a.sentToday/a.dailyLimit)*100),100):0
            const testErr=testErrors[a.id]
            return (
              <div key={a.id} className="card">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base" style={{background:a.color}}>
                      {(a.name||'?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-sage-900">{a.name}</p>
                      <p className="text-xs text-sage-400 mt-0.5">{a.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>
                      <Icon className={`w-2.5 h-2.5 ${a.status==='testing'?'animate-spin':''}`}/>{s.label}
                    </span>
                    <MoreMenu
                      onEdit={()=>{setEditing(a);setShowModal(true)}}
                      onDelete={()=>deleteAccount(a.id)}
                      onDisconnect={()=>disconnectAccount(a.id)}
                      onReconnect={()=>reconnectAccount(a.id)}
                      disconnected={a.status==='disconnected'}
                    />
                  </div>
                </div>

                {testErr && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5"/>
                    <p className="text-[11px] text-red-700 leading-relaxed">{testErr}</p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    {label:'Total sent', value:(a.totalSent||0).toLocaleString()},
                    {label:'Today',      value:(a.sentToday||0).toString()},
                    {label:'Daily cap',  value:a.dailyLimit.toLocaleString()},
                  ].map(s=>(
                    <div key={s.label} className="bg-sage-50 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-[10px] text-sage-400 font-medium">{s.label}</p>
                      <p className="text-sm font-bold text-forest mt-0.5">{s.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between text-[10px] text-sage-400 mb-1.5">
                    <span>Daily usage</span><span>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-sage-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{width:`${pct}%`,background:pct>80?'#f0634a':'#2d5a3d'}}/>
                  </div>
                </div>

                <div className="flex gap-2 pt-3 border-t border-sage-100">
                  <button onClick={()=>testConnection(a.id)} disabled={isTesting}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-forest bg-forest/5 hover:bg-forest/10 py-2 rounded-lg transition-colors disabled:opacity-60">
                    {isTesting?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<Wifi className="w-3.5 h-3.5"/>}
                    {isTesting?'Testing…':'Test connection'}
                  </button>
                  {a.status==='error'&&(
                    <button onClick={()=>testConnection(a.id)} className="flex items-center gap-1.5 text-xs text-coral bg-coral/5 hover:bg-coral/10 px-3 py-2 rounded-lg">
                      <RefreshCw className="w-3 h-3"/>Retry
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && <AccountModal initial={editing||undefined} onSave={()=>{setShowModal(false);reload()}} onClose={()=>setShowModal(false)}/>}
      {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={()=>setToast(null)}/>}
    </div>
  )
}
