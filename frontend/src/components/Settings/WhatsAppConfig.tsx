import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { getWhatsAppConfig, getWhatsAppStatus, testWhatsAppConnection } from '@/services/api'
import { LoadingState } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import toast from 'react-hot-toast'

export function WhatsAppConfig() {
  const [isTesting, setIsTesting] = useState(false)
  const [lastTested, setLastTested] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: config, isLoading, error, refetch } = useQuery({
    queryKey: ['whatsapp-config'],
    queryFn: getWhatsAppConfig,
  })

  const { data: status } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: getWhatsAppStatus,
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

  const handleTestConnection = () => {
    setIsTesting(true)
    testMutation.mutate()
  }

  if (isLoading) {
    return <LoadingState type="card" count={5} />
  }

  if (error) {
    return <EmptyState icon={<NoDataIcon />} title="Failed to load WhatsApp config" description="Please try again later." />
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
        <h4 className="text-sm font-semibold text-surface-800 mb-3">Business Account</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-surface-400">Phone Number</p>
            <p className="text-sm font-medium text-surface-800">{whatsappConfig.phoneNumber || 'Not configured'}</p>
          </div>
          <div>
            <p className="text-xs text-surface-400">Business Name</p>
            <p className="text-sm font-medium text-surface-800">{whatsappConfig.businessName || 'Not configured'}</p>
          </div>
          <div>
            <p className="text-xs text-surface-400">Business ID</p>
            <p className="text-sm font-mono text-surface-600">{whatsappConfig.businessId || 'Not configured'}</p>
          </div>
          <div>
            <p className="text-xs text-surface-400">Verification</p>
            <span className="inline-flex items-center gap-1 text-sm text-success-600">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
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
            <span className="text-sm text-surface-600 font-mono">{whatsappConfig.apiVersion}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-surface-50">
            <div>
              <p className="text-sm font-medium text-surface-800">Webhook URL</p>
              <p className="text-xs text-surface-400 font-mono">{whatsappConfig.webhookUrl || 'Not configured'}</p>
            </div>
            <StatusBadge status={whatsappConfig.webhookStatus} type="conversation" />
          </div>
          <div className="py-2">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-surface-800">Message Usage</p>
                <p className="text-xs text-surface-400">{whatsappConfig.messageLimit} limit</p>
              </div>
              <span className="text-sm text-surface-600">{whatsappConfig.currentUsage} / 1000</span>
            </div>
            <div className="w-full bg-surface-100 rounded-full h-2">
              <div className="bg-primary-600 h-2 rounded-full transition-all" style={{ width: `${(whatsappConfig.currentUsage / 1000) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-surface-800">Message Templates</h4>
          <button className="text-xs text-primary-600 hover:text-primary-700 font-medium">+ Add Template</button>
        </div>
        <div className="space-y-2">
          {whatsappConfig.templates.length > 0 ? (
            whatsappConfig.templates.map((template) => (
              <div key={template.name} className="flex items-center justify-between py-2 border-b border-surface-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-surface-800 font-mono">{template.name}</p>
                  <p className="text-xs text-surface-400">{template.category}</p>
                </div>
                <StatusBadge status={template.status} type="conversation" />
              </div>
            ))
          ) : (
            <p className="text-sm text-surface-400">No templates found</p>
          )}
        </div>
      </div>
      <div className="card p-4">
        <h4 className="text-sm font-semibold text-surface-800 mb-3">Device Pairing</h4>
        <div className="flex items-center gap-6">
          <div className="w-32 h-32 bg-surface-100 rounded-lg flex items-center justify-center border-2 border-dashed border-surface-300">
            <div className="text-center">
              {status?.qrCode ? (
                <img src={status.qrCode} alt="WhatsApp QR Code" className="w-full h-full object-cover rounded" />
              ) : (
                <div>
                  <svg className="w-8 h-8 text-surface-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                  <p className="text-xs text-surface-400">QR Code</p>
                </div>
              )}
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm text-surface-600 mb-2">Scan this QR code with your WhatsApp mobile app to pair a new device.</p>
            <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => refetch()}>Refresh QR Code</button>
          </div>
        </div>
      </div>
    </div>
  )
}