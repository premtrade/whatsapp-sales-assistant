import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getWhatsAppStatus, activateBusiness } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { LoadingState } from '@/components/ErrorState/ErrorState'
import toast from 'react-hot-toast'

export default function SetupPage() {
  const navigate = useNavigate()
  const { staff, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()

  const [connected, setConnected] = useState(false)

  const businessId = staff?.businessId

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: getWhatsAppStatus,
    enabled: !!businessId,
    refetchInterval: 5000,
  })

  const activateMutation = useMutation({
    mutationFn: () => activateBusiness(businessId!),
    onSuccess: () => {
      toast.success('Business activated!')
      setConnected(true)
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Activation failed')
    },
  })

  useEffect(() => {
    if (status?.connected && !connected) {
      setConnected(true)
    }
  }, [status?.connected, connected])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const handleActivate = () => {
    activateMutation.mutate()
  }

  const handleContinue = () => {
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 p-4">
      <div className="max-w-lg w-full card p-8">
        <h2 className="text-2xl font-bold text-surface-900 mb-2">Set up your account</h2>
        <p className="text-surface-500 mb-6">Follow these steps to get your WhatsApp sales assistant running.</p>

        <div className="space-y-4">
          <div className="border border-surface-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${status?.connected ? 'bg-success-500 text-white' : 'bg-surface-200 text-surface-600'}`}>
                {status?.connected ? '✓' : '1'}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-surface-900">Connect WhatsApp</h3>
                <p className="text-sm text-surface-500 mt-1">
                  {status?.connected
                    ? `Connected as ${status.phoneNumber || status.businessName || 'your WhatsApp number'}`
                    : 'Open your WAHA dashboard and scan the QR code with your phone.'}
                </p>
                {!status?.connected && isLoading && <LoadingState type="skeleton" count={1} />}
                {!status?.connected && !isLoading && (
                  <p className="text-xs text-surface-400 mt-2">WAHA session: {staff?.businessId ? `waha-${staff.businessId.slice(0, 6)}` : 'loading...'}</p>
                )}
              </div>
            </div>
          </div>

          <div className="border border-surface-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${connected ? 'bg-success-500 text-white' : 'bg-surface-200 text-surface-600'}`}>
                {connected ? '✓' : '2'}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-surface-900">Activate your business</h3>
                <p className="text-sm text-surface-500 mt-1">Once WhatsApp is connected, activate your account to start receiving messages.</p>
                <button
                  onClick={handleActivate}
                  disabled={activateMutation.isPending || !status?.connected}
                  className="btn btn-primary mt-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {activateMutation.isPending ? 'Activating...' : connected ? 'Activated ✓' : 'Activate Business'}
                </button>
              </div>
            </div>
          </div>

          <div className="border border-surface-200 rounded-lg p-4 opacity-50">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-surface-200 text-surface-600">3</div>
              <div className="flex-1">
                <h3 className="font-semibold text-surface-900">Start selling</h3>
                <p className="text-sm text-surface-500 mt-1">Upload your knowledge base, customize your AI prompt, and send a test message.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <button onClick={handleContinue} className="btn btn-secondary w-full">Skip for now</button>
        </div>
      </div>
    </div>
  )
}
