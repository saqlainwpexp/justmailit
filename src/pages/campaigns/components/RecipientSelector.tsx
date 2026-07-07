import { useState } from 'react'
import { Users, Tag, Search, CheckCircle, Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'

interface ContactMini {
  id: number
  firstName: string
  lastName: string
  email: string
  tags: string[]
  status: string
}

interface Props {
  contacts: ContactMini[]
  allTags: string[]
  loading?: boolean
  value: { type: 'all' | 'tags' | 'specific'; tags: string[]; contactIds: number[] }
  onChange: (v: Props['value']) => void
}

export default function RecipientSelector({ contacts, allTags, loading, value, onChange }: Props) {
  const [search, setSearch] = useState('')

  const subscribed = contacts.filter(c => c.status === 'subscribed')

  const filtered = subscribed.filter(c => {
    const q = search.toLowerCase()
    return `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(q)
  })

  const estimatedCount =
    value.type === 'all'
      ? subscribed.length
      : value.type === 'tags'
      ? subscribed.filter(c => value.tags.some(t => c.tags.includes(t))).length
      : value.contactIds.length

  const toggleTag = (tag: string) => {
    const tags = value.tags.includes(tag) ? value.tags.filter(t => t !== tag) : [...value.tags, tag]
    onChange({ ...value, tags })
  }

  const toggleContact = (id: number) => {
    const ids = value.contactIds.includes(id)
      ? value.contactIds.filter(x => x !== id)
      : [...value.contactIds, id]
    onChange({ ...value, contactIds: ids })
  }

  function initials(c: ContactMini) {
    return ((c.firstName || '').charAt(0) + (c.lastName || '').charAt(0)).toUpperCase() ||
      c.email.charAt(0).toUpperCase()
  }

  function displayName(c: ContactMini) {
    const full = `${c.firstName} ${c.lastName}`.trim()
    return full || c.email
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { type: 'all' as const,      icon: Users,  label: 'All contacts',      desc: loading ? 'Loading…' : `${subscribed.length} subscribed` },
          { type: 'tags' as const,     icon: Tag,    label: 'Filter by tag',     desc: 'Choose specific tags' },
          { type: 'specific' as const, icon: Search, label: 'Specific contacts', desc: 'Hand-pick contacts' },
        ].map(opt => (
          <button
            key={opt.type}
            type="button"
            onClick={() => onChange({ ...value, type: opt.type })}
            className={cn(
              'flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all',
              value.type === opt.type
                ? 'border-forest bg-forest/5'
                : 'border-sage-200 hover:border-sage-300 bg-white'
            )}
          >
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', value.type === opt.type ? 'bg-forest/10' : 'bg-sage-100')}>
              <opt.icon className={cn('w-4 h-4', value.type === opt.type ? 'text-forest' : 'text-sage-500')} />
            </div>
            <div>
              <p className={cn('text-sm font-semibold', value.type === opt.type ? 'text-forest' : 'text-sage-700')}>{opt.label}</p>
              <p className="text-xs text-sage-400 mt-0.5">{opt.desc}</p>
            </div>
            {value.type === opt.type && <CheckCircle className="w-4 h-4 text-forest ml-auto" />}
          </button>
        ))}
      </div>

      {value.type === 'tags' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-sage-500">Select tags to include:</p>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-sage-400"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading tags…</div>
          ) : allTags.length === 0 ? (
            <p className="text-xs text-sage-400">No tags found. Add tags to your contacts first.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                    value.tags.includes(tag)
                      ? 'bg-forest text-white border-forest'
                      : 'bg-white text-sage-600 border-sage-200 hover:border-sage-400'
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {value.type === 'specific' && (
        <div className="border border-sage-200 rounded-xl overflow-hidden">
          <div className="px-3 py-2.5 border-b border-sage-100 bg-sage-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sage-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search contacts…"
                className="input pl-9 py-1.5 text-xs"
              />
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-sage-400">
              <Loader2 className="w-4 h-4 animate-spin" />Loading contacts…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-sage-400">
              {search ? 'No contacts match your search.' : 'No subscribed contacts yet.'}
            </div>
          ) : (
            <div className="max-h-52 overflow-y-auto divide-y divide-sage-50">
              {filtered.map(c => (
                <label key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sage-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value.contactIds.includes(c.id)}
                    onChange={() => toggleContact(c.id)}
                    className="rounded border-sage-300 text-forest focus:ring-forest/20"
                  />
                  <div className="w-7 h-7 rounded-full bg-forest/10 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-semibold text-forest">{initials(c)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-forest">{displayName(c)}</p>
                    <p className="text-[10px] text-sage-400">{c.email}</p>
                  </div>
                  <div className="flex gap-1">
                    {c.tags.slice(0, 2).map(t => (
                      <span key={t} className="text-[9px] bg-sage-100 text-sage-500 px-1.5 py-0.5 rounded-full">{t}</span>
                    ))}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={cn(
        'flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium',
        estimatedCount > 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
      )}>
        <Users className="w-4 h-4 shrink-0" />
        {estimatedCount > 0
          ? <span><span className="font-bold">{estimatedCount}</span> recipient{estimatedCount !== 1 ? 's' : ''} will receive this campaign</span>
          : <span>No recipients selected — please select at least one.</span>
        }
      </div>
    </div>
  )
}
