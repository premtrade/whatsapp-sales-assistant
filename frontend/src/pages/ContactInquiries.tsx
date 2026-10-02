import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getAdminContactInquiries } from '@/services/api'

type ContactInquiry = {
  id: string
  name: string
  business?: string | null
  email: string
  whatsapp?: string | null
  message: string
  source: string
  created_at: string
}

export default function ContactInquiriesPage() {
  const [inquiries, setInquiries] = useState<ContactInquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number; totalPages: number } | null>(null)

  async function loadInquiries() {
    try {
      const result = await getAdminContactInquiries({ page: 1, limit: 50 })
      setInquiries(result.data)
      setMeta(result.meta)
    } catch (err) {
      console.error('Failed to load contact inquiries', err)
      toast.error('Failed to load contact inquiries')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInquiries()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-surface-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-100">Contact Inquiries</h1>
        <p className="text-sm text-surface-400">Messages from the landing page contact form.</p>
      </div>

      {meta && (
        <div className="text-sm text-surface-400">
          Total inquiries: <span className="font-medium text-surface-200">{meta.total}</span>
        </div>
      )}

      <div className="bg-surface-900 border border-surface-800 rounded-xl overflow-hidden">
        {inquiries.length === 0 ? (
          <div className="p-6 text-sm text-surface-400">No inquiries yet.</div>
        ) : (
          <div className="divide-y divide-surface-800">
            {inquiries.map((inquiry) => (
              <div key={inquiry.id} className="p-4 sm:p-6 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-surface-100">{inquiry.name}</p>
                    {inquiry.business && <p className="text-xs text-surface-400">{inquiry.business}</p>}
                  </div>
                  <div className="text-xs text-surface-500">
                    {new Date(inquiry.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="text-xs text-surface-400">
                  <a href={`mailto:${inquiry.email}`} className="text-primary-400 hover:underline">{inquiry.email}</a>
                  {inquiry.whatsapp && <span className="ml-3">{inquiry.whatsapp}</span>}
                </div>
                <p className="text-sm text-surface-300 whitespace-pre-wrap">{inquiry.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
