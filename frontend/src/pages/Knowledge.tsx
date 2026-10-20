import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getKnowledgeDocuments,
  createKnowledgeDocument,
  uploadKnowledgeDocument,
  updateKnowledgeDocument,
  deleteKnowledgeDocument,
  getKnowledgeChunks,
  reindexKnowledgeDocument,
  getKnowledgeDiagnostics,
  testKnowledgeQuery,
  getAdminBusinesses,
  getSelectedTenantId,
  setSelectedTenantId,
} from '@/services/api'
import { useAuth } from '@/context/AuthContext'
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
  const [createMode, setCreateMode] = useState<'upload' | 'text'>('upload')
  const [textForm, setTextForm] = useState({
    title: '',
    document_type: 'faq',
    language: 'en',
    source: '',
    content: '',
  })
  const [showChunks, setShowChunks] = useState(false)
  const [editDoc, setEditDoc] = useState<KnowledgeDocument | null>(null)
  const [editForm, setEditForm] = useState<KnowledgeDocumentUpdateRequest>({})
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDocument | null>(null)
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error' | 'info'
    title: string
    message: string
  } | null>(null)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [testQuestion, setTestQuestion] = useState('')
  const queryClient = useQueryClient()
  const { staff } = useAuth()
  const isPlatformOwner = staff?.role === 'super_admin'

  // Tenant selection for the platform owner. A tenant user is always scoped
  // to the tenant in their token; the owner picks the tenant whose knowledge
  // is being managed, and every request carries it in X-Tenant-Id so nothing
  // is ever written to the wrong tenant.
  const [tenants, setTenants] = useState<Array<{ id: string; name: string; slug: string; status: string }>>([])
  const [selectedTenantId, setSelectedTenantIdState] = useState<string>('')

  useEffect(() => {
    if (!isPlatformOwner) return
    let cancelled = false
    getAdminBusinesses()
      .then((data) => {
        if (cancelled) return
        setTenants(data)
        setSelectedTenantIdState((current) => current || getSelectedTenantId() || data[0]?.id || '')
      })
      .catch(() => {
        // the tenant list is optional - the page still works without it
      })
    return () => {
      cancelled = true
    }
  }, [isPlatformOwner])

  useEffect(() => {
    if (!isPlatformOwner) return
    if (!selectedTenantId) return
    setSelectedTenantId(selectedTenantId)
    queryClient.invalidateQueries({ queryKey: ['knowledge'] })
  }, [isPlatformOwner, selectedTenantId, queryClient])

  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId)

  // Knowledge health: which business the assistant answers for, whether the
  // stored chunks are actually searchable, and what a question retrieves.
  const { data: diagnostics } = useQuery({
    queryKey: ['knowledge', 'diagnostics', selectedTenantId],
    queryFn: getKnowledgeDiagnostics,
    enabled: showDiagnostics,
  })

  const testQueryMutation = useMutation({
    mutationFn: (question: string) => testKnowledgeQuery(question),
    onSuccess: (result) => {
      if (result.hitCount === 0) {
        toast('No matching knowledge found for that question')
      } else {
        toast(`Found ${result.hitCount} matching chunk(s)`)
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Knowledge test failed')
    },
  })

  // Pages restored from the back-forward cache (bfcache) can keep a File object
  // in React state whose underlying blob data is no longer readable, which
  // uploads as an empty/missing part (API replies "File is required"). Clearing
  // the selection on pagehide forces a fresh pick after such navigations.
  useEffect(() => {
    const handlePageHide = () => {
      setUploadFile(null)
    }
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['knowledge', 'documents', { search, status }, selectedTenantId],
    queryFn: () => getKnowledgeDocuments({ page: 1, limit: 50, status, search }),
  })

  // Lazy chunk inspection for the details modal — only fetched when expanded so
  // the list view stays cheap and failures don't block the page.
  const { data: chunks, isLoading: chunksLoading } = useQuery({
    queryKey: ['knowledge', 'chunks', selectedDoc?.id],
    queryFn: () => getKnowledgeChunks(selectedDoc!.id),
    enabled: !!selectedDoc && showChunks,
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
      // A duplicate upload is not a failure: the document is already indexed
      // and usable. Show it as info so users aren't alarmed into retrying.
      if (/already exists/i.test(msg)) {
        toast('This document is already in your knowledge base')
        setFeedbackBanner({
          type: 'info',
          title: 'Already in Knowledge Base',
          message: 'This exact document was already uploaded and indexed — no need to add it again. It is listed under "All Statuses".',
        })
        return
      }
      toast.error(msg)
      setFeedbackBanner({
        type: 'error',
        title: 'Upload Failed',
        message: msg,
      })
    },
  })

  const createMutation = useMutation({
    mutationFn: (payload: { title: string; document_type: string; language: string; source?: string; content: string }) =>
      createKnowledgeDocument(payload),
    onSuccess: (result) => {
      const msg = result.message || `Document "${result.document.title}" created and indexed (${result.chunksCreated ?? 0} chunks created).`
      toast.success(msg)
      setFeedbackBanner({
        type: 'success',
        title: 'Document Created',
        message: msg,
      })
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'documents'] })
      setIsUploadOpen(false)
      setTextForm({ title: '', document_type: 'faq', language: 'en', source: '', content: '' })
      setCreateMode('upload')
    },
    onError: (error: Error) => {
      const msg = error.message || 'Failed to create document'
      if (/already exists/i.test(msg)) {
        toast('This document is already in your knowledge base')
        setFeedbackBanner({
          type: 'info',
          title: 'Already in Knowledge Base',
          message: 'This exact content was already created and indexed — no need to add it again. It is listed under "All Statuses".',
        })
        return
      }
      toast.error(msg)
      setFeedbackBanner({
        type: 'error',
        title: 'Create Failed',
        message: msg,
      })
    },
  })

  const reindexMutation = useMutation({
    mutationFn: (id: string) => reindexKnowledgeDocument(id),
    onSuccess: (result) => {
      // Reindex is a no-op read: it only returns re-upload guidance, so no
      // document/chunk state changed and the list needs no refetch.
      toast.success(result.message || 'Re-upload the original file to re-index this document.')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to request re-index')
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

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!textForm.title.trim()) {
      toast.error('Title is required')
      return
    }
    if (!textForm.content.trim()) {
      toast.error('Content is required')
      return
    }

    createMutation.mutate({
      title: textForm.title.trim(),
      document_type: textForm.document_type,
      language: textForm.language,
      source: textForm.source.trim() || undefined,
      content: textForm.content,
    })
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
              onClick={() => { setCreateMode('upload'); setIsUploadOpen(true) }}
              className="btn-primary text-sm px-4 py-2"
              disabled={uploadMutation.isPending || createMutation.isPending}
            >
              {uploadMutation.isPending || createMutation.isPending ? 'Saving...' : '+ Add Document'}
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
              : feedbackBanner.type === 'info'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-danger-50 border-danger-200 text-danger-900'
          }`}
          role="alert"
        >
          <div className="flex items-start gap-3">
            {feedbackBanner.type === 'success' ? (
              <svg className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 01-18 0 9 9 0 0118 0z" />
              </svg>
            ) : feedbackBanner.type === 'info' ? (
              <svg className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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

      {isPlatformOwner && (
        <div className="card p-4">
          <label htmlFor="knowledge-tenant" className="block text-sm font-semibold text-surface-800">
            Tenant
          </label>
          <p className="text-xs text-surface-500 mb-2">
            You are managing documents for a tenant. Everything below (uploads, listings, diagnostics) applies to
            the selected tenant only.
          </p>
          <select
            id="knowledge-tenant"
            value={selectedTenantId}
            onChange={(event) => setSelectedTenantIdState(event.target.value)}
            className="input w-full sm:w-80"
          >
            {tenants.length === 0 && <option value="">Loading tenants…</option>}
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name} ({tenant.slug}) - {tenant.status}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="card p-4">
        <button
          onClick={() => setShowDiagnostics((value) => !value)}
          className="w-full flex items-center justify-between text-left"
          aria-expanded={showDiagnostics}
        >
          <div>
            <p className="text-sm font-semibold text-surface-800">Knowledge health</p>
            <p className="text-xs text-surface-500">
              Check which business the assistant answers for and whether your documents are actually searchable
            </p>
          </div>
          <span className="text-xs font-medium text-primary-600">
            {showDiagnostics ? 'Hide' : 'Show'}
          </span>
        </button>

        {showDiagnostics && (
          <div className="mt-4 space-y-4 border-t border-surface-200 pt-4">
            {diagnostics ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-surface-50 p-3">
                    <p className="text-xs text-surface-500 uppercase tracking-wide">Assistant answers as</p>
                    <p className="font-semibold text-surface-800 mt-1">
                      {diagnostics.business.name || 'Unknown business'}
                    </p>
                    {isPlatformOwner && selectedTenant && (
                      <p className="text-xs text-surface-500 mt-1">Tenant: {selectedTenant.name}</p>
                    )}
                    {diagnostics.business.greetingReply && (
                      <p className="text-xs text-surface-500 mt-1">
                        Greeting: “{diagnostics.business.greetingReply}”
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg bg-surface-50 p-3">
                    <p className="text-xs text-surface-500 uppercase tracking-wide">Retrievable documents</p>
                    <p className="font-semibold text-surface-800 mt-1">
                      {diagnostics.totals.retrievable} of {diagnostics.totals.documents}
                    </p>
                    <p className="text-xs text-surface-500 mt-1">
                      {diagnostics.totals.embeddedChunks} of {diagnostics.totals.chunks} chunks embedded
                    </p>
                  </div>
                </div>

                {diagnostics.documents.some((doc) => doc.issues.length > 0) && (
                  <ul className="space-y-1 text-xs text-amber-800">
                    {diagnostics.documents
                      .filter((doc) => doc.issues.length > 0)
                      .map((doc) => (
                        <li key={doc.id}>
                          <span className="font-medium">{doc.title}:</span> {doc.issues.join('; ')}
                        </li>
                      ))}
                  </ul>
                )}

                <div className="rounded-lg border border-surface-200 p-3">
                  <p className="text-sm font-medium text-surface-800">Test a question</p>
                  <p className="text-xs text-surface-500 mb-2">
                    Ask something a customer would ask and see exactly which knowledge the AI would use.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={testQuestion}
                      onChange={(event) => setTestQuestion(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && testQuestion.trim()) {
                          testQueryMutation.mutate(testQuestion.trim())
                        }
                      }}
                      placeholder="e.g. What are your services?"
                      className="input flex-1"
                    />
                    <button
                      onClick={() => testQueryMutation.mutate(testQuestion.trim())}
                      disabled={!testQuestion.trim() || testQueryMutation.isPending}
                      className="btn-primary px-4 py-2 text-sm"
                    >
                      {testQueryMutation.isPending ? 'Testing...' : 'Test'}
                    </button>
                  </div>

                  {testQueryMutation.data && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-surface-600">
                        {testQueryMutation.data.hitCount} match(es), best score{' '}
                        {testQueryMutation.data.maxSimilarity?.toFixed(3) ?? 'n/a'} (
                        {testQueryMutation.data.confidence})
                      </p>
                      {testQueryMutation.data.hits.map((hit, index) => (
                        <div key={index} className="rounded-md bg-surface-50 p-2 text-xs text-surface-700">
                          <span className="font-medium">{hit.source}</span>
                          {hit.similarity !== null && (
                            <span className="ml-2 text-surface-500">score {hit.similarity.toFixed(3)}</span>
                          )}
                          <p className="mt-1">{hit.excerpt}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-surface-500">Loading diagnostics…</p>
            )}
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingState type="skeleton" count={8} />
        ) : documents.length === 0 ? (
          <EmptyState
            icon={<NoDataIcon />}
            title={status ? `No ${status} documents` : 'No knowledge documents'}
            description={
              status
                ? `No documents match the "${status}" status filter. Switch to "All Statuses" to see everything.`
                : 'Knowledge documents will help the AI respond accurately.'
            }
          />
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
                    onClick={() => { setSelectedDoc(doc); setShowChunks(false) }}
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
        <Modal isOpen={!!selectedDoc} onClose={() => { setSelectedDoc(null); setShowChunks(false) }} title="Document Details" size="lg">
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
            <div className="pt-4 border-t border-surface-100">
              <button
                type="button"
                onClick={() => setShowChunks(prev => !prev)}
                className="flex items-center justify-between w-full text-left"
              >
                <span className="text-sm font-medium text-surface-700">
                  Indexed Chunks{typeof selectedDoc.chunk_count === 'number' ? ` (${selectedDoc.chunk_count})` : ''}
                </span>
                <svg className={`w-4 h-4 text-surface-400 transition-transform ${showChunks ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showChunks && (
                <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                  {chunksLoading ? (
                    <LoadingState type="skeleton" count={3} />
                  ) : chunks && chunks.length > 0 ? (
                    chunks.map((chunk) => (
                      <div key={chunk.id} className="p-3 bg-surface-50 rounded-lg border border-surface-100">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-surface-500">Chunk {chunk.chunk_number}</span>
                          {typeof chunk.token_count === 'number' && (
                            <span className="text-xs text-surface-400">{chunk.token_count} tokens</span>
                          )}
                        </div>
                        <p className="text-xs text-surface-700 whitespace-pre-wrap break-words">{chunk.chunk_text}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-surface-400 py-2">No chunks indexed for this document.</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-between gap-2 pt-4 border-t border-surface-100">
              <div className="flex gap-2">
                <button
                  onClick={() => { setDeleteTarget(selectedDoc); setSelectedDoc(null); setShowChunks(false) }}
                  className="btn-secondary text-danger-600 hover:text-danger-700"
                >
                  Delete
                </button>
                {(selectedDoc.status === 'failed' || selectedDoc.status === 'processing') && (
                  <button
                    onClick={() => reindexMutation.mutate(selectedDoc.id)}
                    className="btn-secondary"
                    disabled={reindexMutation.isPending}
                    title="Original files are not stored — re-upload the document to re-index it"
                  >
                    {reindexMutation.isPending ? 'Requesting...' : 'Request Re-index'}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setSelectedDoc(null); setShowChunks(false) }} className="btn-secondary">Close</button>
                <button
                  onClick={() => { openEdit(selectedDoc); setSelectedDoc(null); setShowChunks(false) }}
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

      <Modal isOpen={isUploadOpen} onClose={() => { if (!uploadMutation.isPending && !createMutation.isPending) setIsUploadOpen(false) }} title="Add Knowledge Document" size="lg">
        <div className="flex gap-1 p-1 bg-surface-100 rounded-lg mb-4">
          <button
            type="button"
            onClick={() => setCreateMode('upload')}
            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              createMode === 'upload' ? 'bg-white shadow-sm text-surface-900' : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            Upload File
          </button>
          <button
            type="button"
            onClick={() => setCreateMode('text')}
            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              createMode === 'text' ? 'bg-white shadow-sm text-surface-900' : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            Write Text
          </button>
        </div>

        {createMode === 'upload' ? (
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
        ) : (
        <form onSubmit={handleTextSubmit} className="space-y-4">
          {createMutation.isPending && (
            <div className="p-3.5 bg-primary-50 border border-primary-200 rounded-xl text-primary-900 text-sm flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin shrink-0" />
              <div>
                <p className="font-semibold text-primary-950">Creating & Indexing Document</p>
                <p className="text-xs text-primary-800 mt-0.5">Chunking content and generating embeddings for the AI assistant...</p>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="text-title" className="block text-sm font-medium text-surface-700 mb-1">
              Title <span className="text-danger-500">*</span>
            </label>
            <input
              type="text"
              id="text-title"
              value={textForm.title}
              onChange={(e) => setTextForm(prev => ({ ...prev, title: e.target.value }))}
              required
              disabled={createMutation.isPending}
              placeholder="e.g., Pricing FAQ, Return Policy"
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="text-document-type" className="block text-sm font-medium text-surface-700 mb-1">
                Document Type <span className="text-danger-500">*</span>
              </label>
              <select
                id="text-document-type"
                value={textForm.document_type}
                onChange={(e) => setTextForm(prev => ({ ...prev, document_type: e.target.value }))}
                disabled={createMutation.isPending}
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="faq">FAQ</option>
                <option value="policy">Policy</option>
                <option value="website">Website</option>
                <option value="txt">Text</option>
                <option value="markdown">Markdown</option>
                <option value="html">HTML</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="text-language" className="block text-sm font-medium text-surface-700 mb-1">
                Language
              </label>
              <select
                id="text-language"
                value={textForm.language}
                onChange={(e) => setTextForm(prev => ({ ...prev, language: e.target.value }))}
                disabled={createMutation.isPending}
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="text-source" className="block text-sm font-medium text-surface-700 mb-1">
              Source (optional)
            </label>
            <input
              type="text"
              id="text-source"
              value={textForm.source}
              onChange={(e) => setTextForm(prev => ({ ...prev, source: e.target.value }))}
              placeholder="e.g., website URL, internal doc ID"
              disabled={createMutation.isPending}
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label htmlFor="text-content" className="block text-sm font-medium text-surface-700 mb-1">
              Content <span className="text-danger-500">*</span>
            </label>
            <textarea
              id="text-content"
              value={textForm.content}
              onChange={(e) => setTextForm(prev => ({ ...prev, content: e.target.value }))}
              required
              rows={10}
              maxLength={50000}
              disabled={createMutation.isPending}
              placeholder="Paste or write the knowledge the AI should use, e.g. Q&A pairs, policies, product details..."
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-y"
            />
            <p className="text-xs text-surface-400 mt-1">
              {textForm.content.length} / 50000 characters. Content is automatically chunked and embedded for AI retrieval.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-surface-100">
            <button type="button" onClick={() => setIsUploadOpen(false)} className="btn-secondary" disabled={createMutation.isPending}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={createMutation.isPending || !textForm.content.trim() || !textForm.title.trim()}>
              {createMutation.isPending ? 'Creating & Indexing...' : 'Create & Index'}
            </button>
          </div>
        </form>
        )}
      </Modal>
    </div>
  )
}
