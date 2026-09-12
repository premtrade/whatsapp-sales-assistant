import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getKnowledgeDocuments, createKnowledgeDocument } from '@/services/api'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { PageHeader } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import { LoadingState } from '@/components/ErrorState/ErrorState'
import { SearchInput } from '@/components/SearchInput/SearchInput'
import { Modal } from '@/components/Modal/Modal'
import toast from 'react-hot-toast'
import type { KnowledgeDocument, KnowledgeDocumentCreateRequest } from '@/types'

export function KnowledgePage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDocument | null>(null)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [uploadForm, setUploadForm] = useState({
    title: '',
    document_type: 'pdf',
    language: 'en',
    source: '',
  })
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['knowledge', 'documents', { search, status }],
    queryFn: () => getKnowledgeDocuments({ page: 1, limit: 50, status }),
  })

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/knowledge/upload', {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')?.replace('jwt:', '')}`,
        },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Upload failed')
      }
      return response.json()
    },
    onSuccess: (result) => {
      toast.success(result.message || 'Document uploaded successfully')
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'documents'] })
      setIsUploadOpen(false)
      setUploadForm({ title: '', document_type: 'pdf', language: 'en', source: '' })
      setUploadFile(null)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadFile(file)
      if (!uploadForm.title) {
        setUploadForm(prev => ({ ...prev, title: file.name.replace(/\.[^/.]+$/, '') }))
      }
    }
  }

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile) {
      toast.error('Please select a file')
      return
    }
    if (!uploadForm.title.trim()) {
      toast.error('Title is required')
      return
    }

    const formData = new FormData()
    formData.append('file', uploadFile)
    formData.append('title', uploadForm.title)
    formData.append('document_type', uploadForm.document_type)
    formData.append('language', uploadForm.language)
    formData.append('source', uploadForm.source || uploadFile.name)

    uploadMutation.mutate(formData)
  }

  const documents = data?.data || []

  if (error) {
    return <div className="card p-8"><LoadingState type="spinner" /></div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Knowledge Base"
        subtitle="AI Knowledge used by the assistant to respond to customers"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsUploadOpen(true)}
              className="btn-primary text-sm px-4 py-2"
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending ? 'Uploading...' : '+ Add Document'}
            </button>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input w-auto"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="indexed">Indexed</option>
              <option value="failed">Failed</option>
              <option value="archived">Archived</option>
            </select>
            <div className="w-64">
              <SearchInput
                value={search}
                onChange={setSearch}
                onClear={() => setSearch('')}
                placeholder="Search knowledge..."
              />
            </div>
          </div>
        }
      />

      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingState type="skeleton" count={8} />
        ) : documents.length === 0 ? (
          <EmptyState icon={<NoDataIcon />} title="No knowledge documents" description="Knowledge documents will help the AI respond accurately." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="table-header">Title</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Status</th>
                  <th className="table-header hidden md:table-cell">File</th>
                  <th className="table-header hidden lg:table-cell">Language</th>
                  <th className="table-header hidden sm:table-cell">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    onClick={() => setSelectedDoc(doc)}
                    className="table-row cursor-pointer"
                  >
                    <td className="table-cell font-medium text-surface-800">{doc.title}</td>
                    <td className="table-cell text-surface-600 uppercase text-xs">{doc.document_type}</td>
                    <td className="table-cell"><StatusBadge status={doc.status} type="document" /></td>
                    <td className="table-cell text-surface-600 text-xs hidden md:table-cell">{doc.file_name || '-'}</td>
                    <td className="table-cell text-surface-600 hidden lg:table-cell">{doc.language || '-'}</td>
                    <td className="table-cell text-surface-400 text-xs hidden sm:table-cell">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedDoc && (
        <Modal isOpen={!!selectedDoc} onClose={() => setSelectedDoc(null)} title="Document Details" size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-surface-400">Title</p>
                <p className="text-sm text-surface-800">{selectedDoc.title}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-surface-400">Type</p>
                <p className="text-sm text-surface-800 uppercase">{selectedDoc.document_type}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-surface-400">Status</p>
                <StatusBadge status={selectedDoc.status} type="document" />
              </div>
              <div>
                <p className="text-xs font-medium text-surface-400">Language</p>
                <p className="text-sm text-surface-800">{selectedDoc.language}</p>
              </div>
              {selectedDoc.source && (
                <div className="col-span-2">
                  <p className="text-xs font-medium text-surface-400">Source</p>
                  <p className="text-sm text-surface-800 break-all">{selectedDoc.source}</p>
                </div>
              )}
              {selectedDoc.file_name && (
                <div className="col-span-2">
                  <p className="text-xs font-medium text-surface-400">File Name</p>
                  <p className="text-sm text-surface-800">{selectedDoc.file_name}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-4">
              <button onClick={() => setSelectedDoc(null)} className="btn-secondary">Close</button>
            </div>
          </div>
        </Modal>
      )}

      <Modal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} title="Upload Knowledge Document" size="lg">
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          <div>
            <label htmlFor="file" className="block text-sm font-medium text-surface-700 mb-1">
              File <span className="text-danger-500">*</span>
            </label>
            <input
              type="file"
              id="file"
              ref={(el) => el?.click()}
              onChange={handleFileChange}
              accept=".pdf,.docx,.txt,.md,.html,.csv"
              required
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <p className="text-xs text-surface-400 mt-1">Supported: PDF, DOCX, TXT, MD, HTML, CSV (max 50MB)</p>
          </div>
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-surface-700 mb-1">
              Title <span className="text-danger-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              value={uploadForm.title}
              onChange={(e) => setUploadForm(prev => ({ ...prev, title: e.target.value }))}
              required
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label htmlFor="document_type" className="block text-sm font-medium text-surface-700 mb-1">
              Document Type <span className="text-danger-500">*</span>
            </label>
            <select
              id="document_type"
              value={uploadForm.document_type}
              onChange={(e) => setUploadForm(prev => ({ ...prev, document_type: e.target.value }))}
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
              <option value="txt">Text</option>
              <option value="markdown">Markdown</option>
              <option value="html">HTML</option>
              <option value="faq">FAQ</option>
              <option value="policy">Policy</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="language" className="block text-sm font-medium text-surface-700 mb-1">
              Language
            </label>
            <select
              id="language"
              value={uploadForm.language}
              onChange={(e) => setUploadForm(prev => ({ ...prev, language: e.target.value }))}
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
            </select>
          </div>
          <div>
            <label htmlFor="source" className="block text-sm font-medium text-surface-700 mb-1">
              Source (optional)
            </label>
            <input
              type="text"
              id="source"
              value={uploadForm.source}
              onChange={(e) => setUploadForm(prev => ({ ...prev, source: e.target.value }))}
              placeholder="e.g., website URL, internal doc ID"
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-surface-100">
            <button type="button" onClick={() => setIsUploadOpen(false)} className="btn-secondary" disabled={uploadMutation.isPending}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={uploadMutation.isPending || !uploadFile}>
              {uploadMutation.isPending ? 'Uploading & Indexing...' : 'Upload & Index'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
