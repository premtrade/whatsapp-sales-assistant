import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { getWhatsAppConfig, getWhatsAppStatus, testWhatsAppConnection, connectWhatsAppSession, updateWhatsAppConfig, getMessageTemplates, createMessageTemplate, updateMessageTemplate, deleteMessageTemplate } from '@/services/api'
import type { MessageTemplate } from '@/types'
import { LoadingState } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import toast from 'react-hot-toast'
import { Modal } from '@/components/Modal/Modal'
import { ConfirmDialog } from '@/components/Settings/ConfirmDialog'

interface FormData {
  phoneNumber: string
  businessName: string
  businessId: string
  webhookUrl: string
  apiVersion: string
  messageLimit: string
}

interface TemplateFormData {
  name: string
  category: string
  description: string
  subject: string
  body: string
  variables: string
  language: string
  is_active: boolean
}

const emptyForm: FormData = {
  phoneNumber: '',
  businessName: '',
  businessId: '',
  webhookUrl: '',
  apiVersion: 'v18.0',
  messageLimit: '1000',
}

const emptyTemplateForm: TemplateFormData = {
  name: '',
  category: 'greeting',
  description: '',
  subject: '',
  body: '',
  variables: '',
  language: 'en',
  is_active: true,
}

const templateCategories = [
  { value: 'greeting', label: 'Greeting' },
  { value: 'service_inquiry', label: 'Service Inquiry' },
  { value: 'quote_request', label: 'Quote Request' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'closing', label: 'Closing' },
]

export function WhatsAppConfig() {
  const [isTesting, setIsTesting] = useState(false)
  const [lastTested, setLastTested] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any>(null)
  const [templateConfirm, setTemplateConfirm] = useState<{ id: string; name: string } | null>(null)
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormData>(emptyForm)
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [templateForm, setTemplateForm] = useState<TemplateFormData>(emptyTemplateForm)
  const [templateErrors, setTemplateErrors] = useState<Partial<Record<keyof TemplateFormData, string>>>({})

  const { data: config, isLoading, error, refetch } = useQuery({
    queryKey: ['whatsapp-config'],
    queryFn: getWhatsAppConfig,
  })

  const { data: status } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: getWhatsAppStatus,
    // Poll while the session is not paired so the QR and connection state stay fresh.
    refetchInterval: (query) => (query.state.data?.connected ? false : 8000),
  })

  const { data: templatesData } = useQuery({
    queryKey: ['message-templates'],
    queryFn: () => getMessageTemplates(),
  })

  const testMutation = useMutation({
    mutationFn: testWhatsAppConnection,
    onSuccess: (result) => {
      setIsTesting(false)
      setLastTested(new Date().toISOString())
      if (result.success) {
        toast.success(result.message)
        queryClient.invalidateQueries({ queryKey: ['whatsapp-config'] })
        queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] })
      } else {
        toast.error(result.message)
      }
    },
    onError: () => {
      setIsTesting(false)
      toast.error('Connection test failed')
    },
  })

  const connectMutation = useMutation({
    mutationFn: connectWhatsAppSession,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] })
      if (data.connected) toast.success('WhatsApp connected')
      else toast.success('QR code ready — scan it with WhatsApp to link this device')
    },
    onError: () => toast.error('Failed to start WhatsApp pairing'),
  })

  const updateMutation = useMutation({
    mutationFn: updateWhatsAppConfig,
    onSuccess: () => {
      toast.success('WhatsApp configuration saved')
      setIsEditing(false)
      queryClient.invalidateQueries({ queryKey: ['whatsapp-config'] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] })
    },
    onError: () => {
      toast.error('Failed to save configuration')
    },
  })

  const saveTemplateMutation = useMutation({
    mutationFn: async (payload: {
      id?: string
      data: {
        name: string
        category: string
        description?: string | null
        subject?: string | null
        body: string
        variables?: string[]
        language?: string
        is_active?: boolean
      }
    }) => {
      if (payload.id) return updateMessageTemplate(payload.id, payload.data)
      return createMessageTemplate(payload.data)
    },
    onSuccess: (_result, variables) => {
      toast.success(variables.id ? 'Template updated' : 'Template created')
      queryClient.invalidateQueries({ queryKey: ['message-templates'] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-config'] })
      setIsTemplateModalOpen(false)
      setTemplateForm(emptyTemplateForm)
      setEditingTemplate(null)
      setTemplateErrors({})
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to save template')
    },
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => deleteMessageTemplate(id),
    onSuccess: () => {
      toast.success('Template deleted')
      queryClient.invalidateQueries({ queryKey: ['message-templates'] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-config'] })
      setTemplateConfirm(null)
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to delete template')
      setTemplateConfirm(null)
    },
  })

  useEffect(() => {
    if (config) {
      const rawLimit = (config as any).messageLimit || ''
      const numericLimit = rawLimit.replace(/[^0-9]/g, '') || '1000'
      setForm({
        phoneNumber: config.phoneNumber || '',
        businessName: config.businessName || '',
        businessId: config.businessId || '',
        webhookUrl: config.webhookUrl || '',
        apiVersion: config.apiVersion || 'v18.0',
        messageLimit: numericLimit,
      })
    }
  }, [config])

  useEffect(() => {
    if (editingTemplate) {
      setTemplateForm({
        name: editingTemplate.name,
        category: editingTemplate.category,
        description: editingTemplate.description || '',
        subject: editingTemplate.subject || '',
        body: editingTemplate.body,
        variables: Array.isArray(editingTemplate.variables) ? editingTemplate.variables.join(', ') : '',
        language: editingTemplate.language || 'en',
        is_active: editingTemplate.is_active,
      })
    }
  }, [editingTemplate])

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {}
    const phone = form.phoneNumber.trim()
    if (phone && !/^\+?[1-9]\d{6,14}$/.test(phone.replace(/[\s()-]/g, ''))) {
      newErrors.phoneNumber = 'Use E.164 format, e.g. +18765551234'
    }
    const webhook = form.webhookUrl.trim()
    if (webhook && !/^https?:\/\/.+/.test(webhook)) {
      newErrors.webhookUrl = 'Enter a valid URL starting with http:// or https://'
    }
    if (!form.apiVersion.trim()) newErrors.apiVersion = 'API version is required'
    if (!form.messageLimit.trim()) newErrors.messageLimit = 'Message limit is required'
    else if (!/^\d+$/.test(form.messageLimit)) newErrors.messageLimit = 'Message limit must be a number'
    else if (parseInt(form.messageLimit, 10) <= 0) newErrors.messageLimit = 'Message limit must be greater than 0'
    setFormErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateTemplateForm = (): boolean => {
    const newErrors: Partial<Record<keyof TemplateFormData, string>> = {}
    if (!templateForm.name.trim()) newErrors.name = 'Template name is required'
    if (!templateForm.body.trim()) newErrors.body = 'Template body is required'
    if (!templateForm.language.trim()) newErrors.language = 'Language is required'
    setTemplateErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleTestConnection = () => {
    setIsTesting(true)
    testMutation.mutate()
  }

  const handleSave = () => {
    if (validateForm()) {
      updateMutation.mutate({
        phoneNumber: form.phoneNumber,
        businessName: form.businessName,
        businessId: form.businessId,
        webhookUrl: form.webhookUrl,
        apiVersion: form.apiVersion,
        messageLimit: form.messageLimit,
      })
    }
  }

  const handleCancel = () => {
    if (config) {
      const rawLimit = (config as any).messageLimit || ''
      const numericLimit = rawLimit.replace(/[^0-9]/g, '') || '1000'
      setForm({
        phoneNumber: config.phoneNumber || '',
        businessName: config.businessName || '',
        businessId: config.businessId || '',
        webhookUrl: config.webhookUrl || '',
        apiVersion: config.apiVersion || 'v18.0',
        messageLimit: numericLimit,
      })
    }
    setIsEditing(false)
  }

  const handleAddTemplate = () => {
    setIsTemplateModalOpen(true)
    setEditingTemplate(null)
    setTemplateForm(emptyTemplateForm)
  }

  const handleEditTemplate = (template: any) => {
    setEditingTemplate(template)
    setIsTemplateModalOpen(true)
  }

  const handleSaveTemplate = () => {
    if (!validateTemplateForm()) return
    const variables = templateForm.variables
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
    saveTemplateMutation.mutate({
      id: editingTemplate?.id,
      data: {
        name: templateForm.name.trim(),
        category: templateForm.category,
        description: templateForm.description.trim() || null,
        subject: templateForm.subject.trim() || null,
        body: templateForm.body,
        variables,
        language: templateForm.language,
        is_active: templateForm.is_active,
      },
    })
  }

  const handleCancelTemplate = () => {
    setIsTemplateModalOpen(false)
    setTemplateForm(emptyTemplateForm)
    setEditingTemplate(null)
    setTemplateErrors({})
  }

  const handleDeleteTemplate = (template: any) => {
    setTemplateConfirm({ id: template.id, name: template.name })
  }

  const handleConfirmDelete = () => {
    if (templateConfirm) {
      deleteTemplateMutation.mutate(templateConfirm.id)
    }
  }

  const whatsappConfig = config || {
    phoneNumber: '',
    businessName: '',
    businessId: '',
    displayVerified: false,
    webhookUrl: '',
    webhookStatus: 'inactive',
    apiVersion: 'v18.0',
    messageLimit: '1000 messages/24h',
    currentUsage: 0,
    templates: [],
  }

  if (isLoading) {
    return <LoadingState type="card" count={5} />
  }

  if (error) {
    return <EmptyState icon={<NoDataIcon />} title="Failed to load WhatsApp config" description="Please try again later." />
  }

  const limitValue = Number(form.messageLimit || 0)
  const limitPercent = Number.isFinite(limitValue) && limitValue > 0 ? Math.min((whatsappConfig.currentUsage / limitValue) * 100, 100) : 0
  const templates: MessageTemplate[] = templatesData ?? []

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h4 className="text-sm font-semibold text-surface-800 mb-3">Connection Status</h4>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${status?.connected ? 'bg-success-500 animate-pulse' : 'bg-danger-500'}`} />
            <div>
              <p className="text-sm font-medium text-surface-800">{status?.connected ? 'Connected to WhatsApp' : 'Disconnected'}</p>
              <p className="text-xs text-surface-400">{status?.connected ? 'Real-time messaging active' : 'Attempting to reconnect...'}</p>
            </div>
          </div>
          <button onClick={handleTestConnection} disabled={isTesting} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-50">
            {isTesting ? (<span className="flex items-center gap-2"><svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Testing...</span>) : 'Test Connection'}
          </button>
        </div>
        {lastTested && <p className="text-xs text-surface-400 mt-2">Last tested: {new Date(lastTested).toLocaleString()}</p>}
      </div>
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-surface-800">Business Account</h4>
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">Edit</button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={handleCancel} className="text-xs text-surface-600 hover:text-surface-800 font-medium">Cancel</button>
              <button onClick={handleSave} disabled={updateMutation.isPending} className="text-xs text-white bg-primary-600 hover:bg-primary-700 font-medium px-3 py-1.5 rounded-md disabled:opacity-50">
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-surface-400 mb-1">Phone Number</p>
            {isEditing ? (
              <>
                <input className="input" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="+18765551234" />
                {formErrors.phoneNumber && <p className="text-xs text-danger-600 mt-1">{formErrors.phoneNumber}</p>}
              </>
            ) : (
              <p className="text-sm font-medium text-surface-800">{whatsappConfig.phoneNumber || 'Not configured'}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-surface-400 mb-1">Business Name</p>
            {isEditing ? (
              <input className="input" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
            ) : (
              <p className="text-sm font-medium text-surface-800">{whatsappConfig.businessName || 'Not configured'}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-surface-400 mb-1">Business ID</p>
            {isEditing ? (
              <input className="input" value={form.businessId} onChange={(e) => setForm({ ...form, businessId: e.target.value })} />
            ) : (
              <p className="text-sm font-mono text-surface-600">{whatsappConfig.businessId || 'Not configured'}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-surface-400 mb-1">Verification</p>
            <span className="inline-flex items-center gap-1 text-sm text-success-600">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414-1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              {whatsappConfig.displayVerified ? 'Verified' : 'Not Verified'}
            </span>
          </div>
        </div>
      </div>
      <div className="card p-4">
        <h4 className="text-sm font-semibold text-surface-800 mb-3">API Configuration</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-surface-50">
            <div>
              <p className="text-sm font-medium text-surface-800">API Version</p>
              <p className="text-xs text-surface-400">WhatsApp Business API</p>
            </div>
            {isEditing ? (
              <div className="text-right">
                <input className="input w-32" value={form.apiVersion} onChange={(e) => setForm({ ...form, apiVersion: e.target.value })} />
                {formErrors.apiVersion && <p className="text-xs text-danger-600 mt-1">{formErrors.apiVersion}</p>}
              </div>
            ) : (
              <span className="text-sm text-surface-600 font-mono">{whatsappConfig.apiVersion}</span>
            )}
          </div>
          <div className="flex items-center justify-between py-2 border-b border-surface-50">
            <div>
              <p className="text-sm font-medium text-surface-800">Webhook URL</p>
              <p className="text-xs text-surface-400 font-mono">{whatsappConfig.webhookUrl || 'Not configured'}</p>
            </div>
            {isEditing ? (
              <div className="text-right">
                <input className="input w-64" value={form.webhookUrl} onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })} placeholder="https://example.com/api/webhooks/waha" />
                {formErrors.webhookUrl && <p className="text-xs text-danger-600 mt-1">{formErrors.webhookUrl}</p>}
              </div>
            ) : (
              <StatusBadge status={whatsappConfig.webhookStatus} type="conversation" />
            )}
          </div>
          <div className="py-2">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-surface-800">Message Usage</p>
                <p className="text-xs text-surface-400">{whatsappConfig.messageLimit} limit</p>
              </div>
              {isEditing ? (
                <div className="text-right">
                  <input
                    type="number"
                    className="input w-24"
                    value={form.messageLimit}
                    onChange={(e) => setForm({ ...form, messageLimit: e.target.value })}
                  />
                  {formErrors.messageLimit && <p className="text-xs text-danger-600 mt-1">{formErrors.messageLimit}</p>}
                </div>
              ) : (
                <span className="text-sm text-surface-600">{whatsappConfig.currentUsage} / {limitValue || 1000}</span>
              )}
            </div>
            <div className="w-full bg-surface-100 rounded-full h-2">
              <div className="bg-primary-600 h-2 rounded-full transition-all" style={{ width: `${limitPercent}%` }} />
            </div>
          </div>
        </div>
      </div>
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-surface-800">Message Templates</h4>
          <button className="text-xs text-primary-600 hover:text-primary-700 font-medium" onClick={handleAddTemplate}>
            + Add Template
          </button>
        </div>
        <div className="space-y-2">
          {templates.length > 0 ? (
            templates.map((template) => (
              <div key={template.id} className="flex items-center justify-between py-2 border-b border-surface-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-surface-800 font-mono">{template.name}</p>
                  <p className="text-xs text-surface-400">{template.category}</p>
                </div>
                <StatusBadge status={template.is_active ? 'active' : 'inactive'} type="conversation" />
                <button onClick={() => handleEditTemplate(template)} className="text-xs font-medium text-primary-600 hover:text-primary-700">
                  Edit
                </button>
                <button onClick={() => handleDeleteTemplate(template)} className="text-xs font-medium text-danger-600 hover:text-danger-700">
                  Delete
                </button>
              </div>
            ))
          ) : (
            <p className="text-sm text-surface-400">No templates found</p>
          )}
        </div>
      </div>
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-surface-800">Device Pairing</h4>
          <span className={`text-xs font-medium ${status?.connected ? 'text-success-600' : 'text-surface-400'}`}>
            {status?.connected ? `Connected${status.session ? ` · ${status.session}` : ''}` : 'Not paired'}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="w-32 h-32 bg-surface-100 rounded-lg flex items-center justify-center border-2 border-dashed border-surface-300">
            <div className="text-center">
              {status?.qrCode ? (
                <img src={status.qrCode} alt="WhatsApp QR Code" className="w-full h-full object-contain rounded" />
              ) : (
                <div>
                  <svg className="w-8 h-8 text-surface-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                  <p className="text-xs text-surface-400">{status?.connected ? 'Paired' : 'No QR'}</p>
                </div>
              )}
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm text-surface-600 mb-2">
              {status?.connected
                ? `This device is linked${status.session ? ` (session: ${status.session})` : ''}. Replies are sent from this WhatsApp account.`
                : 'Generate a QR code, then scan it with your WhatsApp mobile app (Linked Devices → Link a Device).'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
              >
                {connectMutation.isPending ? 'Starting…' : status?.qrCode ? 'Restart pairing session' : 'Connect / Show QR Code'}
              </button>
              <button
                className="btn-secondary text-xs px-3 py-1.5"
                onClick={() => { queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] }) }}
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Template Modal */}
      <Modal isOpen={isTemplateModalOpen} onClose={handleCancelTemplate}>
        <div className="px-4 pb-4 pt-5 sm:p-6">
          <h3 className="text-base font-semibold leading-6 text-surface-900 mb-4">
            {editingTemplate ? 'Edit Template' : 'Add Template'}
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Name *</label>
                <input type="text" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} className={`input ${templateErrors.name ? 'border-danger-500' : ''}`} placeholder="Welcome greeting" />
                {templateErrors.name && <p className="text-xs text-danger-600 mt-1">{templateErrors.name}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Category *</label>
                <select value={templateForm.category} onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })} className={`input ${templateErrors.category ? 'border-danger-500' : ''}`}>
                  {templateForm.category && !templateCategories.some(cat => cat.value === templateForm.category) && (
                    <option value={templateForm.category}>{templateForm.category}</option>
                  )}
                  {templateCategories.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
                {templateErrors.category && <p className="text-xs text-danger-600 mt-1">{templateErrors.category}</p>}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Description</label>
              <textarea value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} className="input w-full" rows={3} placeholder="Optional description" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Subject (Optional)</label>
              <input type="text" value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} className="input" placeholder="Welcome to Garco" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Body *</label>
              <textarea value={templateForm.body} onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })} className="input w-full" rows={4} placeholder="Hello {{customer_name}}! How can we help?" />
              {templateErrors.body && <p className="text-xs text-danger-600 mt-1">{templateErrors.body}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Variables (Comma-separated)</label>
              <input type="text" value={templateForm.variables} onChange={(e) => setTemplateForm({ ...templateForm, variables: e.target.value })} className="input" placeholder="customer_name, service_type" />
              {templateErrors.variables && <p className="text-xs text-danger-600 mt-1">{templateErrors.variables}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Language</label>
              <select value={templateForm.language} onChange={(e) => setTemplateForm({ ...templateForm, language: e.target.value })} className="input">
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
              {templateErrors.language && <p className="text-xs text-danger-600 mt-1">{templateErrors.language}</p>}
            </div>
            <div className="flex items-center">
              <label className="block text-sm font-medium text-surface-700 mb-1 flex">
                Active
                <input type="checkbox" checked={templateForm.is_active} onChange={(e) => setTemplateForm({ ...templateForm, is_active: e.target.checked })} className="ml-2" />
              </label>
            </div>
          </div>
        </div>
        <div className="bg-surface-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 gap-2">
          <button type="button" className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-surface-900 shadow-sm ring-1 ring-inset ring-surface-300 hover:bg-surface-50 sm:mt-0 sm:w-auto" onClick={handleCancelTemplate}>
            Cancel
          </button>
          <button type="button" onClick={handleSaveTemplate} disabled={saveTemplateMutation.isPending} className="inline-flex w-full justify-center rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 sm:ml-3 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed">
            {saveTemplateMutation.isPending ? 'Saving...' : `${editingTemplate ? 'Update' : 'Add'} Template`}
          </button>
        </div>
      </Modal>
      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={!!templateConfirm}
        title="Delete template?"
        message={templateConfirm ? `Are you sure you want to delete "${templateConfirm.name}"? This action cannot be undone.` : ''}
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setTemplateConfirm(null)}
      />
    </div>
  )
}