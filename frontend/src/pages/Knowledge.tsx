import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getKnowledgeDocuments, createKnowledgeDocument, uploadKnowledgeDocument, updateKnowledgeDocument, deleteKnowledgeDocument } from '@/services/api'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { ErrorState, LoadingState, PageHeader } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import { SearchInput } from '@/components/SearchInput/SearchInput'
import { Modal } from '@/components/Modal/Modal'
import toast from 'react-hot-toast'
import type { KnowledgeDocument, KnowledgeDocumentCreateRequest, KnowledgeDocumentUpdateRequest } from '@/types'

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
  const [editDoc, setEditDoc] = useState<KnowledgeDocument | null>(null)
  const [editForm, setEditForm] = useState<KnowledgeDocumentUpdateRequest>({})
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDocument | null>(null)
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error'
    title: string
    message: string
  } | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['knowledge', 'documents', { search, status }],
    queryFn: () => getKnowledgeDocuments({ page: 1, limit: 50, status, search }),
  })

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => uploadKnowledgeDocument(formData),
    onSuccess: (result) => {
      const msg = result.message || `Document "${result.document.title}" uploaded and indexed (${result.chunksCreated} chunks created).`
      toast.success(msg)
      setFeedbackBanner({
        type: 'success',
        title: 'Upload Successful',
        message: msg,
      })
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'documents'] })
      setIsUploadOpen(false)
      setUploadForm({ title: '', document_type: 'pdf', language: 'en', source: '' })
      setUploadFile(null)
    },
    onError: (error: Error) => {
      const msg = error.message || 'Failed to upload document'
      toast.error(msg)
      setFeedbackBanner({
        type: 'error',
        title: 'Upload Failed',
        message: msg,
      })
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: KnowledgeDocumentUpdateRequest }) =>
      updateKnowledgeDocument(id, data),
    onSuccess: (doc) => {
      const msg = `"${doc.title}" updated successfully`
      toast.success(msg)
      setFeedbackBanner({
        type: 'success',
        title: 'Document Updated',
        message: msg,
      })
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'documents'] })
      setEditDoc(null)
      setSelectedDoc(doc)
    },
    onError: (error: Error) => {
      const msg = error.message || 'Failed to update document'
      toast.error(msg)
      setFeedbackBanner({
        type: 'error',
        title: 'Update Failed',
        message: msg,
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteKnowledgeDocument(id),
    onSuccess: () => {
      toast.success('Document deleted successfully')
      setFeedbackBanner({
        type: 'success',
        title: 'Document Deleted',
        message: 'The document and its indexed vectors were permanently deleted.',
      })
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'documents'] })
      setDeleteTarget(null)
      setSelectedDoc(null)
    },
    onError: (error: Error) => {
      const msg = error.message || 'Failed to delete document'
      toast.error(msg)
      setFeedbackBanner({
        type: 'error',
        title: 'Delete Failed',
        message: msg,
      })
    },
  })

  const openEdit = (doc: KnowledgeDocument) => {
    setEditDoc(doc)
    setEditForm({
      title: doc.title,
      document_type: doc.document_type,
      source: doc.source || '',
      language: doc.language,
      status: doc.status,
    })
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editDoc) return
    if (!editForm.title?.trim()) {
      toast.error('Title is required')
      return
    }
    editMutation.mutate({ id: editDoc.id, data: editForm })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadFile(file)
      const baseName = file.name.replace(/\.[^/.]+$/, '')
      const ext = file.name.split('.').pop()?.toLowerCase()
      setUploadForm(prev => {
        let detectedType = prev.document_type
        if (ext === 'pdf') detectedType = 'pdf'
        else if (ext === 'docx') detectedType = 'docx'
        else if (ext === 'txt') detectedType = 'txt'
        else if (ext === 'md' || ext === 'markdown') detectedType = 'markdown'
        else if (ext === 'html' || ext === 'htm') detectedType = 'html'
        else if (ext === 'csv') detectedType = 'txt'
        return {
          ...prev,
          title: prev.title || baseName,
          document_type: detectedType,
        }
      })
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
    // Show the real failure with a retry instead of an endless spinner that
    // hides auth/network errors from the user.
    return (
      <div className="card p-8">
        <ErrorState
          title="Failed to load knowledge documents"
          message={
            error instanceof Error
              ? error.message
              : (error as { message?: string } | null)?.message ||
                'An error occurred while loading the knowledge base.'
          }
          onRetry={() => refetch()}
        />
      </div>
    )
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

      {feedbackBanner && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-3 shadow-sm animate-fade-in ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-danger-50 border-danger-200 text-danger-900'
          }`}
          role="alert"
        >
          <div className="flex items-start gap-3">
            {feedbackBanner.type === 'success' ? (
              <svg className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-danger-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <div>
              <p className="text-sm font-semibold">{feedbackBanner.title}</p>
              <p className="text-sm opacity-90">{feedbackBanner.message}</p>
            </div>
          </div>
          <button
            onClick={() => setFeedbackBanner(null)}
            className="text-surface-400 hover:text-surface-600 p-1"
            aria-label="Dismiss banner"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

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
                  <th scope="col" className="table-header">Title</th>
                  <th scope="col" className="table-header">Type</th>
                  <th scope="col" className="table-header">Status</th>
                  <th scope="col" className="table-header hidden md:table-cell">Chunks</th>
                  <th scope="col" className="table-header hidden md:table-cell">File</th>
                  <th scope="col" className="table-header hidden lg:table-cell">Language</th>
                  <th scope="col" className="table-header hidden sm:table-cell">Created</th>
                  <th scope="col" className="table-header text-right">Actions</th>
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
                    <td className="table-cell">
                      <StatusBadge status={doc.status} type="document" />
                      {doc.status === 'failed' && doc.metadata?.error ? (
                        <p className="text-xs text-danger-600 mt-1 max-w-[240px] break-words" title={String(doc.metadata.error)}>
                          {String(doc.metadata.error)}
                        </p>
                      ) : null}
                    </td>
                    <td className="table-cell text-surface-600 text-xs hidden md:table-cell">
                      {typeof doc.chunk_count === 'number' ? doc.chunk_count : '-'}
                    </td>
                    <td className="table-cell text-surface-600 text-xs hidden md:table-cell">{doc.file_name || '-'}</td>
                    <td className="table-cell text-surface-600 hidden lg:table-cell">{doc.language || '-'}</td>
                    <td className="table-cell text-surface-400 text-xs hidden sm:table-cell">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(doc) }}
                          className="p-1.5 text-surface-500 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors"
                          title="Edit document"
                          aria-label={`Edit ${doc.title}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(doc) }}
                          className="p-1.5 text-surface-500 hover:text-danger-600 hover:bg-danger-50 rounded-md transition-colors"
                          title="Delete document"
                          aria-label={`Delete ${doc.title}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
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
              <div>
                <p className="text-xs font-medium text-surface-400">Chunks</p>
                <p className="text-sm text-surface-800">{selectedDoc.chunk_count ?? 0}</p>
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
              {selectedDoc.status === 'failed' && selectedDoc.metadata?.error ? (
                <div className="col-span-2">
                  <p className="text-xs font-medium text-danger-500">Indexing Error</p>
                  <p className="text-sm text-danger-700 break-words">{String(selectedDoc.metadata.error)}</p>
                </div>
              ) : null}
            </div>
            <div className="flex justify-between gap-2 pt-4 border-t border-surface-100">
              <button
                onClick={() => { setDeleteTarget(selectedDoc); setSelectedDoc(null) }}
                className="btn-secondary text-danger-600 hover:text-danger-700"
              >
                Delete
              </button>
              <div className="flex gap-2">
                <button onClick={() => setSelectedDoc(null)} className="btn-secondary">Close</button>
                <button
                  onClick={() => { openEdit(selectedDoc); setSelectedDoc(null) }}
                  className="btn-primary"
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editDoc && (
        <Modal isOpen={!!editDoc} onClose={() => setEditDoc(null)} title="Edit Document" size="lg">
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <label htmlFor="edit-title" className="block text-sm font-medium text-surface-700 mb-1">
                Title <span className="text-danger-500">*</span>
              </label>
              <input
                type="text"
                id="edit-title"
                value={editForm.title || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="edit-type" className="block text-sm font-medium text-surface-700 mb-1">Type</label>
                <select
                  id="edit-type"
                  value={editForm.document_type || 'other'}
                  onChange={(e) => setEditForm(prev => ({ ...prev, document_type: e.target.value as KnowledgeDocumentUpdateRequest['document_type'] }))}
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="pdf">PDF</option>
                  <option value="docx">DOCX</option>
                  <option value="txt">Text</option>
                  <option value="markdown">Markdown</option>
                  <option value="html">HTML</option>
                  <option value="faq">FAQ</option>
                  <option value="policy">Policy</option>
                  <option value="website">Website</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label htmlFor="edit-status" className="block text-sm font-medium text-surface-700 mb-1">Status</label>
                <select
                  id="edit-status"
                  value={editForm.status || 'pending'}
                  onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value as KnowledgeDocumentUpdateRequest['status'] }))}
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="indexed">Indexed</option>
                  <option value="failed">Failed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="edit-language" className="block text-sm font-medium text-surface-700 mb-1">Language</label>
              <select
                id="edit-language"
                value={editForm.language || 'en'}
                onChange={(e) => setEditForm(prev => ({ ...prev, language: e.target.value }))}
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
            </div>
            <div>
              <label htmlFor="edit-source" className="block text-sm font-medium text-surface-700 mb-1">Source (optional)</label>
              <input
                type="text"
                id="edit-source"
                value={editForm.source || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, source: e.target.value }))}
                placeholder="e.g., website URL, internal doc ID"
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-surface-100">
              <button type="button" onClick={() => setEditDoc(null)} className="btn-secondary" disabled={editMutation.isPending}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={editMutation.isPending}>
                {editMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Document" size="md">
          <div className="space-y-4">
            <p className="text-sm text-surface-700">
              Are you sure you want to delete <span className="font-semibold text-surface-900">"{deleteTarget.title}"</span>?
              This permanently removes the document and all of its indexed chunks. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-4 border-t border-surface-100">
              <button type="button" onClick={() => setDeleteTarget(null)} className="btn-secondary" disabled={deleteMutation.isPending}>
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                className="btn-primary bg-danger-600 hover:bg-danger-700 text-white"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <Modal isOpen={isUploadOpen} onClose={() => { if (!uploadMutation.isPending) setIsUploadOpen(false) }} title="Upload Knowledge Document" size="lg">
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          {uploadMutation.isPending && (
            <div className="p-3.5 bg-primary-50 border border-primary-200 rounded-xl text-primary-900 text-sm flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin shrink-0" />
              <div>
                <p className="font-semibold text-primary-950">Uploading & Indexing Document</p>
                <p className="text-xs text-primary-800 mt-0.5">Extracting text and generating embeddings for the AI assistant...</p>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="file" className="block text-sm font-medium text-surface-700 mb-1">
              File <span className="text-danger-500">*</span>
            </label>
            <input
              type="file"
              id="file"
              onChange={handleFileChange}
              accept=".pdf,.docx,.txt,.md,.html,.csv"
              required
              disabled={uploadMutation.isPending}
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
            />
            {uploadFile ? (
              <p className="text-xs text-emerald-600 font-medium mt-1.5 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Selected: {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
              </p>
            ) : (
              <p className="text-xs text-surface-400 mt-1">Supported formats: PDF, DOCX, TXT, MD, HTML, CSV (max 50MB)</p>
            )}
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
              disabled={uploadMutation.isPending}
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
              disabled={uploadMutation.isPending}
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
              disabled={uploadMutation.isPending}
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
              disabled={uploadMutation.isPending}
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
