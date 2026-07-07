import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, TrendingUp, TrendingDown, ArrowRight, MoreHorizontal, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useData } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { formatNumber } from '../lib/utils'

interface Overview {
  totals: {
    sent: number; opened: number; clicked: number; bounced: number
    openRate: number; clickRate: number; contacts: number; campaigns: number; automations: number
  }
  chart: { month: string; sent: number; opened: number; rate: number }[]
  upcoming: { id: number; name: string; scheduledAt: string; status: string }[]
}

const CustomBar = (props: any) => {
  const { x, y, width, height, payload } = props
  const maxRate = 100
  const frac = payload.rate / maxRate
  return <rect x={x} y={y} width={width} height={height} rx={6} fill={frac > 0.5 ? '#2d5a3d' : '#e4e9dd'} />
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-sage-100 rounded-lg px-3 py-2 shadow-card text-xs">
      <p className="text-sage-500 mb-0.5">{label}</p>
      <p className="font-semibold text-forest">{payload[0].value}% open rate</p>
      <p className="text-sage-400">{payload[0]?.payload?.sent ?? 0} sent</p>
    </div>
  )
}

function UpcomingItem({ item }: { item: Overview['upcoming'][number] }) {
  const date = new Date(item.scheduledAt)
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const dayStr  = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const isToday = new Date().toDateString() === date.toDateString()
  return (
    <div className="border rounded-xl px-3 py-2.5 flex items-center gap-3 bg-amber-50 border-amber-200">
      <span className="text-base">📬</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-sage-800 truncate">{item.name}</p>
        <p className="text-[10px] text-sage-500 mt-0.5">{timeStr} · {isToday ? 'Today' : dayStr}</p>
      </div>
      <button className="w-5 h-5 rounded hover:bg-black/5 flex items-center justify-center shrink-0">
        <MoreHorizontal className="w-3.5 h-3.5 text-sage-400" />
      </button>
    </div>
  )
}

// Generate week calendar, offset in whole weeks from the current one
function getWeekDays(weekOffset: number) {
  const today = new Date()
  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    return {
      day: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3),
      date: d.getDate(),
      isToday: d.toDateString() === today.toDateString(),
      key: d.toDateString(),
    }
  })
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, loading } = useData<Overview>('/api/stats/overview')
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset])
  const monthLabel = useMemo(() => {
    const mid = new Date(); mid.setDate(mid.getDate() - ((mid.getDay() + 6) % 7) + weekOffset * 7 + 3)
    return mid.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }, [weekOffset])

  const upcomingFiltered = useMemo(() => {
    const all = data?.upcoming || []
    if (!selectedDay) return all
    return all.filter(item => new Date(item.scheduledAt).toDateString() === selectedDay)
  }, [data?.upcoming, selectedDay])

  const totals = data?.totals
  const chart  = data?.chart || []

  const stats = totals ? [
    { label: 'Delivered',   value: totals.sent,     change: `${totals.openRate}% open`, up: totals.openRate > 30 },
    { label: 'Opened',      value: totals.opened,   change: `${totals.openRate}%`,      up: totals.openRate > 30 },
    { label: 'Clicked',     value: totals.clicked,  change: `${totals.clickRate}%`,     up: totals.clickRate > 5  },
    { label: 'Contacts',    value: totals.contacts, change: `${totals.campaigns} campaigns`, up: true },
  ] : []

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-forest animate-spin" />
    </div>
  )

  const isEmpty = !totals?.sent && !totals?.contacts

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle mt-1">
            Welcome back, <span className="text-forest font-medium">{user?.name || 'there'}</span>. Here's what's happening.
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/campaigns/new')}>
          <Plus className="w-4 h-4" />
          Create campaign
        </button>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="card flex flex-col items-center py-14 text-center">
          <div className="w-16 h-16 rounded-2xl bg-forest/10 flex items-center justify-center mb-4">
            <Plus className="w-7 h-7 text-forest" />
          </div>
          <h3 className="text-base font-semibold text-sage-900 mb-1">You're all set up — let's send your first campaign</h3>
          <p className="text-sm text-sage-500 mb-6 max-w-sm">Add contacts, connect an email account, and create your first campaign to see real stats here.</p>
          <div className="flex gap-3">
            <button className="btn-primary" onClick={() => navigate('/campaigns/new')}>Create campaign</button>
            <button className="btn-ghost" onClick={() => navigate('/contacts')}>Add contacts</button>
          </div>
        </div>
      )}

      {/* Stats row */}
      {!isEmpty && (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="section-title">Performance Overview</h2>
              <p className="text-xs text-sage-400 mt-0.5">All time</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-sage-400 bg-sage-50 px-2 py-1 rounded-md">{totals?.automations || 0} active automations</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map(s => (
              <div key={s.label} className="bg-sage-50 rounded-xl p-4">
                <p className="text-xs text-sage-500 font-medium mb-3">{s.label}</p>
                <div className="flex items-end justify-between gap-2">
                  <p className="text-2xl font-semibold text-forest tracking-tight">{formatNumber(s.value)}</p>
                  <span className={s.up ? 'stat-badge-up' : 'stat-badge-down'}>
                    {s.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {s.change}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Chart */}
        <div className="card lg:col-span-3">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="section-title">Open Rate by Month</h2>
              <p className="text-xs text-sage-400 mt-0.5">Last 6 months</p>
            </div>
          </div>

          {chart.every(c => c.rate === 0) ? (
            <div className="h-48 flex items-center justify-center text-sm text-sage-400">
              Send your first campaign to see performance data here.
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-3 mb-1">
                <p className="text-3xl font-bold text-forest tracking-tight">{totals?.openRate ?? 0}%</p>
                <span className="stat-badge-up"><TrendingUp className="w-3 h-3" />avg open rate</span>
              </div>
              <div className="mt-4 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} barSize={32} margin={{ top:16, right:0, left:-20, bottom:0 }}>
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize:11, fill:'#87a069' }} />
                    <YAxis hide />
                    <Tooltip content={<CustomTooltip />} cursor={false} />
                    <ReferenceLine y={50} stroke="#c8d4ba" strokeDasharray="4 3" strokeWidth={1} />
                    <Bar dataKey="rate" shape={<CustomBar />} label={{ position:'top', fontSize:10, fill:'#6a8a4e', formatter:(v:number)=>`${v}%` }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>

        {/* Upcoming */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">Scheduled</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setWeekOffset(w => w - 1); setSelectedDay(null) }}
                className="w-6 h-6 rounded-md hover:bg-sage-100 flex items-center justify-center"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-sage-500" />
              </button>
              <button
                onClick={() => { setWeekOffset(w => w + 1); setSelectedDay(null) }}
                className="w-6 h-6 rounded-md hover:bg-sage-100 flex items-center justify-center"
              >
                <ChevronRight className="w-3.5 h-3.5 text-sage-500" />
              </button>
            </div>
          </div>

          <p className="text-xs font-semibold text-sage-500 mb-3">
            {monthLabel}
          </p>

          <div className="grid grid-cols-7 mb-4">
            {weekDays.map(({ day, date, isToday, key }) => (
              <div key={key} className="flex flex-col items-center gap-1.5">
                <span className="text-[10px] text-sage-400 font-medium">{day}</span>
                <button
                  onClick={() => setSelectedDay(d => d === key ? null : key)}
                  className={`w-7 h-7 rounded-full text-xs font-medium transition-colors ${
                    selectedDay === key ? 'bg-forest text-white ring-2 ring-forest/30 ring-offset-1'
                    : isToday ? 'bg-forest text-white'
                    : 'text-sage-700 hover:bg-sage-100'
                  }`}
                >
                  {date}
                </button>
              </div>
            ))}
          </div>

          <div className="divider" />

          <div className="space-y-2.5">
            {selectedDay && (
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-sage-400 uppercase tracking-wider">
                  {new Date(selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </p>
                <button className="text-[10px] text-forest hover:underline" onClick={() => setSelectedDay(null)}>Show all</button>
              </div>
            )}
            {upcomingFiltered.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-sage-400">{selectedDay ? 'Nothing scheduled this day' : 'No scheduled campaigns'}</p>
                <button className="text-xs text-forest hover:underline mt-1" onClick={() => navigate('/campaigns/new')}>
                  Schedule one now
                </button>
              </div>
            ) : (
              <>
                {!selectedDay && <p className="text-[10px] font-semibold text-sage-400 uppercase tracking-wider">Upcoming</p>}
                {upcomingFiltered.map(item => <UpcomingItem key={item.id} item={item} />)}
              </>
            )}
          </div>

          <button className="mt-4 w-full flex items-center justify-center gap-1.5 text-xs font-medium text-forest hover:text-forest/70 transition-colors" onClick={() => navigate('/campaigns')}>
            View all campaigns
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
