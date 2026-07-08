import { useState, useEffect } from 'react'
import {
  Plus, Globe, CheckCircle, XCircle, AlertCircle, Copy,
  RefreshCw, Trash2, X, ChevronDown, ChevronUp,
  Shield, Loader2, Info, CheckCheck, Check,
} from 'lucide-react'
import { useData, apiFetch } from '../lib/api'

interface DnsRecord {
  key: string; type: string; name: string; value: string; description: string
  managedExternally?: boolean; docsUrl?: string
}
interface Domain {
  id: number; domain: string
  spfStatus: 'pass'|'fail'|'pending'|'verifying'
  dkimStatus: 'pass'|'fail'|'pending'|'verifying'|'external'
  dmarcStatus: 'pass'|'fail'|'pending'|'verifying'
  expanded: boolean; createdAt: string; lastVerifiedAt: string|null
  records?: DnsRecord[]
  provider?: string | null
}

const STATUS_CFG = {
  pass:      { icon:CheckCircle, cls:'text-green-600 bg-green-50',   label:'Pass'      },
  fail:      { icon:XCircle,     cls:'text-red-600 bg-red-50',       label:'Not found' },
  pending:   { icon:AlertCircle, cls:'text-amber-600 bg-amber-50',   label:'Pending'   },
  verifying: { icon:Loader2,     cls:'text-blue-600 bg-blue-50',     label:'Checking…' },
  external:  { icon:Info,        cls:'text-blue-600 bg-blue-50',     label:'Provider-managed' },
}

// DKIM 'external' means a known SMTP provider handles it themselves — we can't probe
// their real record, so it's treated as satisfied rather than pending/failed.
function dkimOk(status: Domain['dkimStatus']) { return status === 'pass' || status === 'external' }

function statusBadge(d: Domain) {
  if (d.spfStatus==='pass' && dkimOk(d.dkimStatus) && d.dmarcStatus==='pass')
    return { label:'All verified', cls:'bg-green-50 text-green-700 border-green-200' }
  if (d.spfStatus==='fail' || d.dmarcStatus==='fail' || d.dkimStatus==='fail')
    return { label:'Action needed', cls:'bg-red-50 text-red-600 border-red-200' }
  return { label:'Setup pending', cls:'bg-amber-50 text-amber-700 border-amber-200' }
}

function RecordRow({ record, copied, onCopy }: { record:DnsRecord; copied:string|null; onCopy:(v:string)=>void }) {
  if (record.managedExternally) {
    return (
      <div className="rounded-xl border border-blue-100 bg-blue-50/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-blue-600 bg-white border border-blue-200 rounded px-1.5 py-0.5">{record.type}</span>
            <p className="text-xs font-semibold text-blue-900">{record.key.toUpperCase()}</p>
          </div>
        </div>
        <div className="px-4 py-3 space-y-2">
          <p className="text-xs text-blue-800">{record.value}</p>
          <p className="text-[11px] text-blue-600">{record.description}</p>
          {record.docsUrl && (
            <a href={record.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-[11px] font-semibold text-blue-700 hover:underline">
              View setup docs →
            </a>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-sage-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-sage-50 border-b border-sage-100">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-sage-500 bg-white border border-sage-200 rounded px-1.5 py-0.5">{record.type}</span>
          <p className="text-xs font-semibold text-sage-900">{record.key.toUpperCase()}</p>
        </div>
        <p className="text-[10px] text-sage-400">{record.description}</p>
      </div>
      <div className="px-4 py-3 space-y-2">
        <div>
          <p className="text-[10px] text-sage-400 font-medium mb-1">Name / Host</p>
          <div className="flex items-center justify-between gap-2 bg-sage-50 rounded-lg px-3 py-2">
            <code className="text-[10px] text-forest break-all flex-1">{record.name}</code>
            <button onClick={()=>onCopy(record.name)} className="shrink-0 text-sage-400 hover:text-forest transition-colors">
              {copied===record.name?<CheckCheck className="w-3.5 h-3.5 text-green-500"/>:<Copy className="w-3.5 h-3.5"/>}
            </button>
          </div>
        </div>
        <div>
          <p className="text-[10px] text-sage-400 font-medium mb-1">Value</p>
          <div className="flex items-start justify-between gap-2 bg-sage-50 rounded-lg px-3 py-2">
            <code className="text-[10px] text-forest break-all flex-1">{record.value}</code>
            <button onClick={()=>onCopy(record.value)} className="shrink-0 mt-0.5 text-sage-400 hover:text-forest transition-colors">
              {copied===record.value?<CheckCheck className="w-3.5 h-3.5 text-green-500"/>:<Copy className="w-3.5 h-3.5"/>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DomainCard({
  domain, onToggle, onVerify, onDelete, verifying,
}: {
  domain: Domain; onToggle:()=>void; onVerify:(id:number)=>void
  onDelete:(id:number)=>void; verifying:number|null
}) {
  const [copied, setCopied] = useState<string|null>(null)
  const badge = statusBadge(domain)
  const isVerifying = verifying===domain.id

  function copy(v:string) {
    navigator.clipboard.writeText(v).then(()=>{ setCopied(v); setTimeout(()=>setCopied(null),2000) })
  }

  const records: DnsRecord[] = domain.records || [
    { key:'spf',   type:'TXT', name:domain.domain,                           value:'Loading…', description:'SPF record' },
    { key:'dkim',  type:'TXT', name:`keepmailing._domainkey.${domain.domain}`,   value:'Loading…', description:'DKIM record' },
    { key:'dmarc', type:'TXT', name:`_dmarc.${domain.domain}`,               value:'Loading…', description:'DMARC record' },
  ]

  const statusKeys = ['spf','dkim','dmarc'] as const
  const statusMap = { spf: domain.spfStatus, dkim: domain.dkimStatus, dmarc: domain.dmarcStatus }

  return (
    <div className="card !p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-sage-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-forest/10 flex items-center justify-center">
            <Globe className="w-4 h-4 text-forest"/>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-sage-900">{domain.domain}</p>
              {domain.provider && (
                <span className="text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">via {domain.provider}</span>
              )}
            </div>
            {domain.lastVerifiedAt && (
              <p className="text-[10px] text-sage-400 mt-0.5">Verified {new Date(domain.lastVerifiedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${badge.cls}`}>{badge.label}</span>
          <button onClick={()=>onVerify(domain.id)} disabled={isVerifying}
            className="flex items-center gap-1.5 text-xs font-medium text-forest bg-forest/5 hover:bg-forest/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
            {isVerifying?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<RefreshCw className="w-3.5 h-3.5"/>}
            {isVerifying?'Checking DNS…':'Verify DNS'}
          </button>
          <button onClick={()=>onDelete(domain.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-sage-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-3.5 h-3.5"/>
          </button>
          <button onClick={onToggle} className="w-7 h-7 rounded-lg hover:bg-sage-100 flex items-center justify-center text-sage-400 transition-colors">
            {domain.expanded?<ChevronUp className="w-3.5 h-3.5"/>:<ChevronDown className="w-3.5 h-3.5"/>}
          </button>
        </div>
      </div>

      {/* Status pills */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-sage-50">
        {statusKeys.map(key=>{
          const val = statusMap[key] as keyof typeof STATUS_CFG
          const cfg = STATUS_CFG[val] || STATUS_CFG.pending
          const Icon = cfg.icon
          return (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${cfg.cls}`}>
                <Icon className={`w-3 h-3 ${val==='verifying'?'animate-spin':''}`}/>
              </div>
              <span className="text-[11px] font-semibold text-sage-700 uppercase">{key}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cfg.cls}`}>{cfg.label}</span>
            </div>
          )
        })}
      </div>

      {/* DNS records (expanded) */}
      {domain.expanded && (
        <div className="p-5 space-y-3">
          <p className="text-xs font-semibold text-sage-700 mb-1">Add these DNS records to your domain registrar:</p>
          {records.map(r=><RecordRow key={r.key} record={r} copied={copied} onCopy={copy}/>)}

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 mt-2">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5"/>
            <div>
              <p className="text-xs font-semibold text-blue-800">DNS propagation takes up to 48 hours</p>
              <p className="text-[11px] text-blue-600 mt-0.5">After adding the records, click "Verify DNS" to check. It may take a few minutes to a few hours for changes to propagate.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RecordList({ records }: { records: DnsRecord[] }) {
  const [copied, setCopied] = useState<string|null>(null)
  function copy(v:string) { navigator.clipboard.writeText(v).then(()=>{ setCopied(v); setTimeout(()=>setCopied(null),2000) }) }
  return <>{records.map(r=><RecordRow key={r.key} record={r} copied={copied} onCopy={copy}/>)}</>
}

function AddDomainModal({ onAdd, onClose }: { onAdd:(d:Domain)=>void; onClose:()=>void }) {
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Domain|null>(null)

  async function submit(e:React.FormEvent) {
    e.preventDefault(); setError('')
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\//g,'')
    if (!d) return setError('Enter a domain name.')
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return setError('Enter a valid domain (e.g. yourdomain.com).')
    setLoading(true)
    try {
      const r = await apiFetch<Domain>('/api/domains',{json:{domain:d}})
      setResult(r)
    } catch(e:any){setError(e.message)} finally{setLoading(false)}
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-sage-100 sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-sage-900">{result?'DNS Records':'Add domain'}</h3>
          <button onClick={()=>{if(result)onAdd(result);else onClose()}} className="w-8 h-8 rounded-lg hover:bg-sage-100 flex items-center justify-center"><X className="w-4 h-4 text-sage-400"/></button>
        </div>
        <div className="p-5">
          {!result ? (
            <form onSubmit={submit} className="space-y-4">
              {error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500"/>{error}</div>}
              <div>
                <label className="label">Domain name</label>
                <input className="input" placeholder="yourdomain.com" value={domain} onChange={e=>setDomain(e.target.value)}/>
                <p className="text-[11px] text-sage-400 mt-1">Enter your root domain without http:// or www.</p>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">
                  {loading?<><Loader2 className="w-4 h-4 animate-spin"/>Adding…</>:<><Plus className="w-4 h-4"/>Add domain</>}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <CheckCircle className="w-4 h-4 shrink-0"/>
                <span className="font-medium">{result.domain}</span> added — now add these DNS records:
              </div>
              <RecordList records={result.records||[]}/>
              <p className="text-[11px] text-sage-500 text-center">After adding all records, go back and click "Verify DNS".</p>
              <button onClick={()=>onAdd(result)} className="btn-primary w-full"><Check className="w-4 h-4"/>Done — I've added the records</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Domains() {
  const { data: rawDomains, loading, error, reload } = useData<Domain[]>('/api/domains')
  // Local overrides: expanded state, live status, fetched records
  const [overrides, setOverrides] = useState<Record<number, Partial<Domain>>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [verifying, setVerifying] = useState<number|null>(null)

  const domains: Domain[] = (rawDomains || []).map(d => ({ ...d, ...overrides[d.id] }))

  function setDomainProp(id: number, props: Partial<Domain>) {
    setOverrides(o => ({ ...o, [id]: { ...o[id], ...props } }))
  }

  // Domains can arrive already expanded (e.g. right after creation) — fetch their
  // records once instead of waiting for a manual collapse/expand toggle.
  useEffect(() => {
    for (const d of domains) {
      if (d.expanded && !d.records) {
        apiFetch<DnsRecord[]>(`/api/domains/${d.id}/records`)
          .then(records => setDomainProp(d.id, { records }))
          .catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawDomains])

  function toggleExpand(id: number) {
    const dom = domains.find(d => d.id === id)
    const expanding = !dom?.expanded
    setDomainProp(id, { expanded: expanding })
    if (expanding && !dom?.records) {
      apiFetch<DnsRecord[]>(`/api/domains/${id}/records`)
        .then(records => setDomainProp(id, { records }))
        .catch(() => {})
    }
  }

  async function verify(id: number) {
    setVerifying(id)
    setDomainProp(id, { spfStatus: 'verifying', dkimStatus: 'verifying', dmarcStatus: 'verifying' })
    try {
      const r = await apiFetch<{ ok: boolean; spf: string; dkim: string; dmarc: string }>(`/api/domains/${id}/verify`, { method: 'POST' })
      setDomainProp(id, { spfStatus: r.spf as any, dkimStatus: r.dkim as any, dmarcStatus: r.dmarc as any, lastVerifiedAt: new Date().toISOString() })
    } catch {} finally { setVerifying(null) }
  }

  async function deleteDomain(id: number) {
    if (!confirm('Remove this domain?')) return
    await apiFetch(`/api/domains/${id}`, { method: 'DELETE' })
    reload()
  }

  function onDomainAdded(d: Domain) {
    setShowAdd(false)
    reload()
  }

  const isFullyVerified = (d: Domain) => d.spfStatus === 'pass' && dkimOk(d.dkimStatus) && d.dmarcStatus === 'pass'
  const allPass = domains.length > 0 && domains.every(isFullyVerified)
  const warnings = domains.filter(d => d.spfStatus === 'fail' || d.dkimStatus === 'fail' || d.dmarcStatus === 'fail').length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div><h1 className="page-title">Domains</h1><p className="page-subtitle">Verify sending domains for better deliverability</p></div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4"/>Add domain</button>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0"/>
          <p className="text-sm text-red-700">Could not load domains: <span className="font-medium">{error}</span></p>
          <button onClick={reload} className="ml-auto text-xs text-red-600 hover:underline font-medium">Retry</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Domains added',  value: domains.length.toString(),                                                                                                    icon: Globe,       color: 'text-forest'     },
          { label: 'Fully verified', value: domains.filter(isFullyVerified).length.toString(),         icon: CheckCircle, color: 'text-green-600'  },
          { label: 'Need attention', value: warnings.toString(),                                                                                                            icon: AlertCircle, color: 'text-amber-600'  },
        ].map(s => (
          <div key={s.label} className="card flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sage-50 flex items-center justify-center shrink-0"><s.icon className={`w-4 h-4 ${s.color}`}/></div>
            <div><p className="text-[11px] text-sage-500 font-medium">{s.label}</p><p className="text-lg font-bold text-forest mt-0.5">{s.value}</p></div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 text-forest animate-spin"/></div>
      ) : domains.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <Shield className="w-10 h-10 text-sage-300 mb-3"/>
          <p className="text-sm font-medium text-sage-600 mb-1">No domains added</p>
          <p className="text-xs text-sage-400 mb-5 max-w-sm">Verifying your domain with SPF, DKIM, and DMARC records dramatically improves email deliverability and prevents spoofing.</p>
          <button className="btn-primary" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4"/>Add your first domain</button>
        </div>
      ) : (
        <div className="space-y-4">
          {allPass && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <CheckCircle className="w-4 h-4 text-green-600 shrink-0"/>
              <p className="text-sm font-medium text-green-800">All domains verified — you're ready to send with high deliverability.</p>
            </div>
          )}
          {domains.map(d => (
            <DomainCard key={d.id} domain={d} onToggle={() => toggleExpand(d.id)} onVerify={verify} onDelete={deleteDomain} verifying={verifying}/>
          ))}
        </div>
      )}

      {/* Educational footer */}
      <div className="card bg-sage-50/50">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-sage-500 shrink-0 mt-0.5"/>
          <div>
            <p className="text-xs font-semibold text-sage-700 mb-2">Why these records matter</p>
            <div className="grid grid-cols-3 gap-4 text-xs text-sage-600">
              <div><span className="font-semibold text-sage-800">SPF</span> — Lists servers allowed to send email from your domain. Prevents spoofing.</div>
              <div><span className="font-semibold text-sage-800">DKIM</span> — Cryptographic signature on every email, proving it wasn't tampered with in transit.</div>
              <div><span className="font-semibold text-sage-800">DMARC</span> — Tells receiving servers what to do when SPF or DKIM fails. Protects your brand.</div>
            </div>
          </div>
        </div>
      </div>

      {showAdd && <AddDomainModal onAdd={onDomainAdded} onClose={() => setShowAdd(false)}/>}
    </div>
  )
}
