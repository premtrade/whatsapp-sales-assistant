import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSettings, updateSetting, getStaffUsers, getCurrentStaff, createStaffUser, updateStaffUser, updateStaffStatus, deleteStaffUser, exportSettings, importSettings, clearSystemCache } from "@/services/api"
import { PageHeader, LoadingState, ErrorState } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { SearchInput } from '@/components/SearchInput/SearchInput'
import { SettingInput } from '@/components/Settings/SettingInput'
import { StaffModal, type StaffFormData } from '@/components/Settings/StaffModal'
import { ConfirmDialog } from '@/components/Settings/ConfirmDialog'
import { WhatsAppConfig } from '@/components/Settings/WhatsAppConfig'
import { SystemHealth } from '@/components/Settings/SystemHealth'
import toast from 'react-hot-toast'
import type { Setting, StaffUser } from '@/types'

type TabId = 'general' | 'staff' | 'whatsapp' | 'system'

function groupSettings(settings: Setting[]): { company: Setting[]; ai: Setting[]; notifications: Setting[]; other: Setting[] } {
  const company: Setting[] = []
  const ai: Setting[] = []
  const notifications: Setting[] = []
  const other: Setting[] = []
  for (const s of settings) {
    const key = s.setting_key.toLowerCase()
    if (key.includes('company') || key.includes('business') || key.includes('timezone') || key.includes('address') || key.includes('phone') || key.includes('email')) {
      company.push(s)
    } else if (key.includes('ai_') || key.includes('bot') || key.includes('auto') || key.includes('model') || key.includes('prompt')) {
      ai.push(s)
    } else if (key.includes('notif') || key.includes('alert') || key.includes('reminder') || key.includes('follow')) {
      notifications.push(s)
    } else {
      other.push(s)
    }
  }
  return { company, ai, notifications, other }
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [staffSearch, setStaffSearch] = useState('')
  const [staffRoleFilter, setStaffRoleFilter] = useState('')
  const [staffStatusFilter, setStaffStatusFilter] = useState('')
  const [settingSearch, setSettingSearch] = useState('')
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null)
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)
  const queryClient = useQueryClient()

  const { data: settings, isLoading: settingsLoading, error: settingsError, refetch: refetchSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })

  const { data: staff, isLoading: staffLoading, error: staffError, refetch: refetchStaff } = useQuery({
    queryKey: ['staff', 'users'],
    queryFn: () => getStaffUsers({ page: 1, limit: 100 }),
  })

  const { data: currentStaff, isLoading: currentStaffLoading, error: currentStaffError } = useQuery({
    queryKey: ['current-staff'],
    queryFn: getCurrentStaff,
  })

  const updateMutation = useMutation({
    mutationFn: (data: { setting_key: string; setting_value: string }) => updateSetting(data),
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success(`"${variables.setting_key.replace(/_/g, ' ')}" updated`)
    },
    onError: () => toast.error('Failed to update setting'),
  })

  const tabs: { id: TabId; label: string; description: string }[] = [
    { id: 'general', label: 'General', description: 'Company, AI and notification preferences' },
    { id: 'staff', label: 'Staff', description: 'Team members, roles and access' },
    { id: 'whatsapp', label: 'WhatsApp', description: 'Business account, templates and pairing' },
    { id: 'system', label: 'System', description: 'Health, maintenance and audit trail' },
  ]

  const generalSettings = useMemo(() => (settings || []).filter((s) => !s.is_system), [settings])
  const systemSettings = useMemo(() => (settings || []).filter((s) => s.is_system), [settings])

  const filteredGeneral = useMemo(() => {
    const q = settingSearch.trim().toLowerCase()
    if (!q) return generalSettings
    return generalSettings.filter(
      (s) => s.setting_key.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q),
    )
  }, [generalSettings, settingSearch])

  const grouped = useMemo(() => groupSettings(filteredGeneral), [filteredGeneral])

  const filteredStaff = useMemo(() => {
    const list = staff?.data || []
    const q = staffSearch.trim().toLowerCase()
    return list.filter((u) => {
      if (staffRoleFilter && u.role !== staffRoleFilter) return false
      if (staffStatusFilter && u.status !== staffStatusFilter) return false
      if (!q) return true
      return (
        u.display_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)
      )
    })
  }, [staff, staffSearch, staffRoleFilter, staffStatusFilter])

  const handleSaveSetting = (key: string, value: string) => {
    updateMutation.mutate({ setting_key: key, setting_value: value })
  }

  const handleSaveStaff = (_formData: StaffFormData) => {
    toast.success(editingStaff ? 'Staff member updated' : 'Invitation sent to new staff member')
    setIsStaffModalOpen(false)
    setEditingStaff(null)
    refetchStaff()
  }

  const handleToggleStaffStatus = (user: StaffUser) => {
    const next = user.status === 'active' ? 'inactive' : 'active'
    setConfirmState({
      title: next === 'active' ? 'Reactivate staff member?' : 'Deactivate staff member?',
      message: next === 'active'
        ? `${user.display_name} will regain access to the dashboard.`
        : `${user.display_name} will lose access immediately. They can be reactivated later.`,
      onConfirm: () => {
        toast.success(`${user.display_name} ${next === 'active' ? 'reactivated' : 'deactivated'}`)
        setConfirmState(null)
        refetchStaff()
      },
    })
  }

  const renderSettingGroup = (title: string, subtitle: string, items: Setting[]) => {
    if (items.length === 0) return null
    return (
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-surface-800">{title}</h3>
        <p className="text-xs text-surface-400 mb-2">{subtitle}</p>
        <div className="divide-y divide-surface-50">
          {items.map((setting) => (
            <SettingInput key={setting.id} setting={setting} onSave={handleSaveSetting} isSaving={updateMutation.isPending} />
          ))}
        </div>
      </div>
    )
  }

  if (settingsError && activeTab !== 'staff') {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Settings" subtitle="Configure your application" />
        <div className="card p-8">
          <ErrorState onRetry={() => refetchSettings()} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Settings"
        subtitle="Configure your workspace, team and integrations"
        actions={
          activeTab === 'staff' ? (
            <button onClick={() => { setEditingStaff(null); setIsStaffModalOpen(true) }} className="btn-primary text-sm px-4 py-2">
              + Add Staff Member
            </button>
          ) : undefined
        }
      />

      <div className="card overflow-hidden">
        <div className="border-b border-surface-100 px-4">
          <nav className="flex gap-6 -mb-px overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                title={tab.description}
                className={`py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-surface-500 hover:text-surface-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'general' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="w-full sm:max-w-xs">
                  <SearchInput value={settingSearch} onChange={setSettingSearch} onClear={() => setSettingSearch('')} placeholder="Search settings..." />
                </div>
                <p className="text-xs text-surface-400">
                  {filteredGeneral.length} of {generalSettings.length} settings{updateMutation.isPending ? ' · saving…' : ''}
                </p>
              </div>
              {settingsLoading ? (
                <LoadingState type="skeleton" count={5} />
              ) : filteredGeneral.length === 0 ? (
                <EmptyState
                  icon={<NoDataIcon />}
                  title={generalSettings.length === 0 ? 'No general settings configured' : 'No settings match your search'}
                  description={generalSettings.length === 0 ? 'General settings will appear here once configured.' : 'Try a different search term.'}
                />
              ) : (
                <>
                  {renderSettingGroup('Company Information', 'Identity, contact and locale used across quotes and messages.', grouped.company)}
                  {renderSettingGroup('AI Assistant', 'Auto-replies, handoff behaviour and response tuning.', grouped.ai)}
                  {renderSettingGroup('Notifications & Follow-ups', 'Reminders, alerts and escalation preferences.', grouped.notifications)}
                  {renderSettingGroup('Other Preferences', 'Everything else that does not fit the groups above.', grouped.other)}
                </>
              )}
            </div>
          )}
          {activeTab === 'staff' && (
            <div className="space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="w-full lg:max-w-xs">
                  <SearchInput value={staffSearch} onChange={setStaffSearch} onClear={() => setStaffSearch('')} placeholder="Search name or email..." />
                </div>
                <div className="flex items-center gap-2">
                  <select value={staffRoleFilter} onChange={(e) => setStaffRoleFilter(e.target.value)} className="input w-auto text-sm">
                    <option value="">All Roles</option>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="sales">Sales</option>
                    <option value="support">Support</option>
                    <option value="technician">Technician</option>
                  </select>
                  <select value={staffStatusFilter} onChange={(e) => setStaffStatusFilter(e.target.value)} className="input w-auto text-sm">
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>
              {staffLoading ? (
                <LoadingState type="skeleton" count={5} />
              ) : staffError ? (
                <ErrorState onRetry={() => refetchStaff()} />
              ) : filteredStaff.length === 0 ? (
                <EmptyState
                  icon={<NoDataIcon />}
                  title="No staff members found"
                  description="Adjust your filters or invite a new team member."
                  action={
                    <button onClick={() => { setEditingStaff(null); setIsStaffModalOpen(true) }} className="btn-primary text-sm px-4 py-2 mt-4">
                      + Add Staff Member
                    </button>
                  }
                />
              ) : (
                <div className="overflow-x-auto border border-surface-100 rounded-lg">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-surface-100 bg-surface-50/50">
                        <th className="table-header">Name</th>
                        <th className="table-header">Email</th>
                        <th className="table-header hidden md:table-cell">Phone</th>
                        <th className="table-header">Role</th>
                        <th className="table-header">Status</th>
                        <th className="table-header text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-50">
                      {filteredStaff.map((user: StaffUser) => (
                        <tr key={user.id} className="table-row">
                          <td className="table-cell">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-semibold shrink-0">
                                {(user.display_name || '?').charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-surface-800 truncate">{user.display_name}</p>
                                <p className="text-xs text-surface-400 font-mono">{user.employee_number}</p>
                              </div>
                            </div>
                          </td>
                          <td className="table-cell text-surface-600">{user.email}</td>
                          <td className="table-cell text-surface-600 hidden md:table-cell">{user.phone || '—'}</td>
                          <td className="table-cell capitalize text-surface-600">{user.role}</td>
                          <td className="table-cell"><StatusBadge status={user.status} type="staff" /></td>
                          <td className="table-cell">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => { setEditingStaff(user); setIsStaffModalOpen(true) }} className="text-xs font-medium text-primary-600 hover:text-primary-700">Edit</button>
                              <span className="text-surface-200">|</span>
                              <button onClick={() => handleToggleStaffStatus(user)} className={`text-xs font-medium ${user.status === 'active' ? 'text-danger-600 hover:text-danger-700' : 'text-success-600 hover:text-success-700'}`}>
                                {user.status === 'active' ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-surface-400">Showing {filteredStaff.length} of {staff?.data?.length || 0} team members</p>
            </div>
          )}

          {activeTab === 'whatsapp' && <WhatsAppConfig />}

          {activeTab === 'system' && (
            <div className="space-y-6">
              <SystemHealth />
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-surface-800">System Settings</h3>
                <p className="text-xs text-surface-400 mb-2">Read-only values managed by your administrator.</p>
                {settingsLoading ? (
                  <LoadingState type="skeleton" count={3} />
                ) : systemSettings.length === 0 ? (
                  <p className="text-sm text-surface-400">No system settings</p>
                ) : (
                  <div className="divide-y divide-surface-50">
                    {systemSettings.map((setting: Setting) => (
                      <div key={setting.id} className="flex items-center justify-between py-3 gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-surface-800">
                            {setting.setting_key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                          </p>
                          <p className="text-xs text-surface-400">{setting.description}</p>
                        </div>
                        <input type="text" value={setting.setting_value || ''} disabled className="w-48 input bg-surface-50 font-mono text-xs" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <StaffModal
        isOpen={isStaffModalOpen}
        staff={editingStaff}
        onClose={() => { setIsStaffModalOpen(false); setEditingStaff(null) }}
        onSave={handleSaveStaff}
        isLoading={false}
      />

      <ConfirmDialog
        isOpen={!!confirmState}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        variant="warning"
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  )
}


