import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getCrmSettings, updateCrmSettings, testCrmConnection } from '@/services/api'
import type { CrmSettings } from '@/types'

interface FormState {
  provider: 'odoo' | 'none'
  enabled: boolean
  url: string
  database: string
  apiKey: string
}

const emptyForm: FormState = {
  provider: 'none',
  enabled: false,
  url: '',
  database: '',
  apiKey: '',
}

function toForm(s: CrmSettings): FormState {
  return {
    provider: s.provider,
    enabled: s.enabled,
    url: s.odoo.url || '',
    database: s.odoo.database || '',
    apiKey: '',
  }
}

export function CrmIntegration() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [testResult, setTestResult] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['integrations', 'crm'],
    queryFn: getCrmSettings,
    staleTime: 30000,
  })

  useEffect(() => {
    if (data) setForm(toForm(data))
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () =>
      updateCrmSettings({
        provider: form.provider,
        enabled: form.enabled,
        odoo: {
          url: form.url.trim(),
          database: form.database.trim(),
          apiKey: form.apiKey.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success('CRM settings saved')
      setForm((f) => ({ ...f, apiKey: '' }))
      queryClient.invalidateQueries({ queryKey: ['integrations', 'crm'] })
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save CRM settings')
    },
  })

  const testMutation = useMutation({
    mutationFn: () => testCrmConnection(),
    onSuccess: (result) => {
      setTestResult(result.message)
      if (result.success) toast.success(result.message)
      else toast.error(result.message)
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Connection test failed'
      setTestResult(message)
      toast.error(message)
    },
  })

  if (isLoading) {
    return <div className="text-sm text-surface-400 py-6">Loading CRM settings…</div>
  }

  if (isError) {
    return (
      <div className="text-sm text-red-400 py-6">
        Could not load CRM settings. Only admins can view integrations.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-surface-100">CRM Integration</h3>
        <p className="text-sm text-surface-400">
          Push qualified leads and accepted quotes to an external CRM. Currently supports Odoo.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-1">
            Provider
          </label>
          <select
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value as FormState['provider'] })}
            className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="none">Disabled</option>
            <option value="odoo">Odoo</option>
          </select>
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-surface-200">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              className="rounded border-surface-600 bg-surface-800 text-primary-600 focus:ring-primary-500"
            />
            Enable automatic sync
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-1">
            Odoo URL
          </label>
          <input
            type="text"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://odoo.example.com"
            className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-1">
            Database
          </label>
          <input
            type="text"
            value={form.database}
            onChange={(e) => setForm({ ...form, database: e.target.value })}
            placeholder="mydb"
            className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-1">
            API Key {data?.odoo.hasApiKey && <span className="text-surface-500 normal-case">(saved — leave blank to keep)</span>}
          </label>
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            placeholder={data?.odoo.hasApiKey ? '••••••••' : 'Paste Odoo API key'}
            className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      </div>

      {testResult && (
        <p className="text-sm text-surface-300 bg-surface-800 border border-surface-700 rounded px-3 py-2">
          {testResult}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-800">
        <button
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending || form.provider !== 'odoo'}
          className="px-4 py-2 text-sm font-medium text-surface-300 bg-surface-800 hover:bg-surface-700 border border-surface-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testMutation.isPending ? 'Testing…' : 'Test connection'}
        </button>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-surface-900"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

