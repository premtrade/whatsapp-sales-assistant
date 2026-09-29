import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getAdminSettings, updateAdminSettings } from '@/services/api'

interface SettingsForm {
  [key: string]: string
}

export default function GlobalSettingsPage() {
  const [settings, setSettings] = useState<SettingsForm>({})
  const [originalSettings, setOriginalSettings] = useState<SettingsForm>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    try {
      const data = await getAdminSettings()
      setSettings(data)
      setOriginalSettings(data)
    } catch (err) {
      console.error('Failed to load settings', err)
      toast.error('Failed to load global settings')
    } finally {
      setLoading(false)
    }
  }

  function handleChange(key: string, value: string) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateAdminSettings(settings)
      setOriginalSettings(settings)
      toast.success('Global settings saved')
    } catch (err: any) {
      toast.error(err.message || 'Failed to save global settings')
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setSettings(originalSettings)
  }

  function hasChanges() {
    return JSON.stringify(settings) !== JSON.stringify(originalSettings)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-surface-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-100">Global Settings</h1>
        <p className="text-sm text-surface-400">Manage platform-wide configuration settings.</p>
      </div>

      <div className="bg-surface-900 border border-surface-800 rounded-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.keys(settings).map((key) => (
            <div key={key}>
              <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-1">
                {key}
              </label>
              <input
                type="text"
                value={settings[key] || ''}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder={`Enter ${key} value`}
              />
            </div>
          ))}
        </div>

        {Object.keys(settings).length === 0 && (
          <div className="text-center py-8 text-surface-500">
            No global settings found.
          </div>
        )}

        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-surface-800">
          <button
            onClick={handleReset}
            disabled={!hasChanges() || saving}
            className="px-4 py-2 text-sm font-medium text-surface-300 bg-surface-800 hover:bg-surface-700 border border-surface-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges() || saving}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-surface-900"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}