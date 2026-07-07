import { useState } from 'react'
import { Monitor, Smartphone, X } from 'lucide-react'

interface Props {
  subject: string
  previewText: string
  bodyHtml: string
  fromName: string
  fromEmail: string
  onClose: () => void
}

export default function EmailPreview({ subject, previewText, bodyHtml, fromName, fromEmail, onClose }: Props) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')

  const preview = bodyHtml
    .replace(/\{\{first_name\}\}/g, 'John')
    .replace(/\{\{last_name\}\}/g, 'Smith')
    .replace(/\{\{email\}\}/g, 'john@example.com')
    .replace(/\{\{company\}\}/g, 'Acme Inc')
    .replace(/\{\{unsubscribe_link\}\}/g, '#')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sage-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-forest">Email preview</h2>
            <p className="text-xs text-sage-400 mt-0.5">Showing with sample contact data</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-sage-100 rounded-lg p-0.5">
              {(['desktop', 'mobile'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDevice(d)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    device === d ? 'bg-white shadow-sm text-forest' : 'text-sage-500 hover:text-sage-700'
                  }`}
                >
                  {d === 'desktop' ? <Monitor className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
                  {d === 'desktop' ? 'Desktop' : 'Mobile'}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-sage-100 flex items-center justify-center transition-colors">
              <X className="w-4 h-4 text-sage-500" />
            </button>
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-y-auto bg-sage-50 p-6 flex justify-center">
          <div
            className={`transition-all duration-300 ${device === 'desktop' ? 'w-full max-w-2xl' : 'w-[375px]'}`}
          >
            {/* Email client chrome */}
            <div className="bg-white rounded-xl shadow-card overflow-hidden">
              {/* Inbox snippet preview */}
              <div className="px-5 py-3.5 border-b border-sage-100 bg-sage-50">
                <p className="text-[10px] font-semibold text-sage-400 uppercase tracking-wider mb-2">How it looks in inbox</p>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-forest flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-white">{fromName.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold text-forest">{fromName}</span>
                      <span className="text-[10px] text-sage-400 shrink-0">just now</span>
                    </div>
                    <p className="text-xs font-medium text-sage-800 truncate">{subject || '(no subject)'}</p>
                    <p className="text-xs text-sage-400 truncate">{previewText || bodyHtml.replace(/<[^>]+>/g, '').slice(0, 80)}</p>
                  </div>
                </div>
              </div>

              {/* Email header */}
              <div className="px-5 py-4 border-b border-sage-100">
                <p className="text-xs text-sage-500 mb-0.5">From: <span className="font-medium text-forest">{fromName}</span> &lt;{fromEmail}&gt;</p>
                <p className="text-xs text-sage-500">To: John Smith &lt;john@example.com&gt;</p>
                <h1 className="text-base font-semibold text-forest mt-2">{subject || '(no subject)'}</h1>
              </div>

              {/* Email body */}
              <div
                className="px-6 py-5 prose prose-sm max-w-none text-sage-800"
                style={{ fontFamily: 'Arial, sans-serif', lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: preview || '<p style="color:#aaa">No content yet</p>' }}
              />

              {/* Email footer */}
              <div className="px-6 py-4 border-t border-sage-100 bg-sage-50 text-center">
                <p className="text-[10px] text-sage-400">
                  You received this because you opted in. &nbsp;
                  <a href="#" className="text-forest underline">Unsubscribe</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
