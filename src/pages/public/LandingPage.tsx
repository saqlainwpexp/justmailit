import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Mail } from 'lucide-react'
import PublicForm, { type PublicFormConfig } from './PublicForm'

interface PageData {
  name: string
  headline: string
  subheadline: string
  body: string
  form: PublicFormConfig | null
}

// Rendered at /lp/:slug — a standalone, publicly hosted page (not wrapped in
// ProtectedRoute, no sidebar/nav). Meant to be linked directly from ads,
// social, email, etc.
export default function LandingPage() {
  const { slug } = useParams()
  const [page, setPage] = useState<PageData | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/public/landing-pages/${slug}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setPage)
      .catch(() => setNotFound(true))
  }, [slug])

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-gray-800">Page not found</h1>
          <p className="text-sm text-gray-500 mt-1">This page may have been unpublished or removed.</p>
        </div>
      </div>
    )
  }

  if (!page) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 text-[#2d5a3d] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-16">
      <div className="flex items-center gap-2 mb-10">
        <div className="w-8 h-8 rounded-lg bg-[#2d5a3d] flex items-center justify-center">
          <Mail className="w-4 h-4 text-white" />
        </div>
      </div>
      <div className="max-w-lg w-full text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 leading-tight">{page.headline}</h1>
        {page.subheadline && <p className="text-base text-gray-500 mt-3">{page.subheadline}</p>}
        {page.body && <p className="text-sm text-gray-600 mt-6 whitespace-pre-wrap leading-relaxed">{page.body}</p>}
      </div>
      {page.form && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 w-full max-w-sm">
          <PublicForm config={page.form} />
        </div>
      )}
    </div>
  )
}
