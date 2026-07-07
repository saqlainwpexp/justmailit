import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import PublicForm, { type PublicFormConfig } from './PublicForm'

// Rendered at /embed/form/:id — meant to be loaded inside an <iframe> on a
// third-party site, so it's deliberately bare (no header/sidebar/nav).
export default function EmbedForm() {
  const { id } = useParams()
  const [config, setConfig] = useState<PublicFormConfig | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/public/forms/${id}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setConfig)
      .catch(() => setNotFound(true))
  }, [id])

  if (notFound) {
    return <div className="p-6 text-center text-sm text-gray-400">This form is no longer available.</div>
  }
  if (!config) {
    return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 text-[#2d5a3d] animate-spin" /></div>
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <PublicForm config={config} />
    </div>
  )
}
