import { useState, useEffect } from 'react'

interface SettingInputProps {
  setting: {
    id: string
    setting_key: string
    setting_value: string | null
    data_type: 'string' | 'integer' | 'decimal' | 'boolean' | 'json'
    description: string | null
    is_system: boolean
  }
  onSave: (key: string, value: string) => void
  isSaving: boolean
}

export function SettingInput({ setting, onSave, isSaving }: SettingInputProps) {
  const [value, setValue] = useState(setting.setting_value || '')
  const [error, setError] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    setValue(setting.setting_value || '')
    setHasChanges(false)
    setError(null)
  }, [setting.setting_value])

  const handleChange = (newValue: string) => {
    setValue(newValue)
    setHasChanges(newValue !== (setting.setting_value || ''))
    setError(null)
  }

  const validate = (): boolean => {
    if (setting.data_type === 'integer') {
      if (value && !/^-?\d+$/.test(value)) {
        setError('Please enter a valid integer')
        return false
      }
    }
    if (setting.data_type === 'decimal') {
      if (value && !/^-?\d*\.?\d+$/.test(value)) {
        setError('Please enter a valid number')
        return false
      }
    }
    if (setting.data_type === 'json') {
      if (value) {
        try {
          JSON.parse(value)
        } catch {
          setError('Please enter valid JSON')
          return false
        }
      }
    }
    return true
  }

  const handleSave = () => {
    if (!validate()) return
    onSave(setting.setting_key, value)
  }

  const handleBooleanToggle = () => {
    const boolValue = value === 'true' || value === '1' || value === 'yes'
    const next = !boolValue ? 'true' : 'false'
    setValue(next)
    setHasChanges(false)
    setError(null)
    onSave(setting.setting_key, next)
  }

  const handleReset = () => {
    setValue(setting.setting_value || '')
    setHasChanges(false)
    setError(null)
  }

  const formatLabel = (key: string) => {
    return key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  }

  const renderInput = () => {
    if (setting.data_type === 'boolean') {
      const boolValue = value === 'true' || value === '1' || value === 'yes'
      return (
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={boolValue}
            onClick={handleBooleanToggle}
            disabled={isSaving}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
              boolValue ? 'bg-primary-600' : 'bg-surface-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                boolValue ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-sm text-surface-600">
            {boolValue ? 'Enabled' : 'Disabled'}
            {isSaving ? ' · saving…' : ''}
          </span>
        </div>
      )
    }

    if (setting.data_type === 'json') {
      return (
        <textarea
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          rows={4}
          className="input font-mono text-sm"
          placeholder="Enter JSON value..."
        />
      )
    }

    return (
      <input
        type={setting.data_type === 'integer' || setting.data_type === 'decimal' ? 'number' : 'text'}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="input w-full max-w-xs"
        placeholder={`Enter ${setting.data_type} value...`}
      />
    )
  }

  return (
    <div className="py-4 border-b border-surface-50 last:border-0">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-surface-800">
              {formatLabel(setting.setting_key)}
            </p>
            {setting.is_system && (
              <span className="inline-flex items-center rounded bg-surface-100 px-1.5 py-0.5 text-xs font-medium text-surface-500">
                System
              </span>
            )}
          </div>
          {setting.description && (
            <p className="text-xs text-surface-400 mt-0.5">{setting.description}</p>
          )}
          {error && (
            <p className="text-xs text-danger-600 mt-1">{error}</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {renderInput()}
          {hasChanges && setting.data_type !== 'boolean' && (
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={handleReset}
                className="text-xs text-surface-500 hover:text-surface-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
