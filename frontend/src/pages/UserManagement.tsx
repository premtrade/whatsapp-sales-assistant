import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getAdminUsers, updateAdminUser, deleteAdminUser, getAdminBusinesses, createTenantAdmin } from '@/services/api'
import type { StaffUser } from '@/types'
import { useAuth } from '@/context/AuthContext'

interface UserRow extends StaffUser {
  businessId?: string
  created_at?: string
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ role: string; status: string }>({ role: '', status: '' })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [businesses, setBusinesses] = useState<Array<{ id: string; name: string; slug: string; status: string }>>([])
  const [createForm, setCreateForm] = useState({ email: '', password: '', first_name: '', last_name: '', business_id: '', role: 'admin', status: 'active' })
  const [creating, setCreating] = useState(false)
  const { staff } = useAuth()

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      const data = await getAdminUsers()
      setUsers(data)
    } catch (err) {
      console.error('Failed to load users', err)
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  async function loadBusinesses() {
    try {
      const data = await getAdminBusinesses()
      setBusinesses(data)
    } catch (err) {
      console.error('Failed to load businesses', err)
    }
  }

  function openCreateModal() {
    setCreateForm({ email: '', password: '', first_name: '', last_name: '', business_id: '', role: 'admin', status: 'active' })
    setShowCreateModal(true)
    loadBusinesses()
  }

  function closeCreateModal() {
    setShowCreateModal(false)
    setCreating(false)
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!createForm.business_id) {
      toast.error('Please select a business')
      return
    }
    setCreating(true)
    try {
      await createTenantAdmin(createForm)
      toast.success('Tenant admin created')
      closeCreateModal()
      loadUsers()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create tenant admin')
    } finally {
      setCreating(false)
    }
  }

  function startEdit(user: UserRow) {
    setEditingId(user.id)
    setEditForm({ role: user.role, status: user.status })
  }

  async function saveEdit(id: string) {
    try {
      await updateAdminUser(id, editForm)
      toast.success('User updated')
      setEditingId(null)
      loadUsers()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user')
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Are you sure you want to delete this user?')) return
    try {
      await deleteAdminUser(id)
      toast.success('User deleted')
      loadUsers()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete user')
    }
  }

  const roleOptions = ['super_admin', 'admin', 'manager', 'sales', 'support', 'technician'] as const
  const statusOptions = ['active', 'inactive', 'suspended'] as const

  const canManage = staff?.role === 'super_admin' || staff?.role === 'admin'

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-surface-100">User Management</h1>
            <p className="text-sm text-surface-400">Manage platform users and their permissions.</p>
          </div>
          {canManage && (
            <button
              onClick={openCreateModal}
              className="text-sm px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded"
            >
              Create Tenant Admin
            </button>
          )}
        </div>
      </div>

      <div className="bg-surface-900 border border-surface-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-950 text-surface-400">
              <tr>
                <th scope="col" className="text-left px-4 py-3 font-medium">Name</th>
                <th scope="col" className="text-left px-4 py-3 font-medium">Email</th>
                <th scope="col" className="text-left px-4 py-3 font-medium">Role</th>
                <th scope="col" className="text-left px-4 py-3 font-medium">Status</th>
                <th scope="col" className="text-left px-4 py-3 font-medium">Employee #</th>
                <th scope="col" className="text-left px-4 py-3 font-medium">Business</th>
                <th scope="col" className="text-left px-4 py-3 font-medium">Created</th>
                <th scope="col" className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-surface-500">No users found.</td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-surface-800/50">
                    <td className="px-4 py-3 text-surface-100 font-medium">
                      {user.first_name} {user.last_name}
                    </td>
                    <td className="px-4 py-3 text-surface-300">{user.email}</td>
                    <td className="px-4 py-3">
                      {editingId === user.id ? (
                        <select
                          value={editForm.role}
                          onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                          className="bg-surface-800 border border-surface-700 rounded px-2 py-1 text-sm text-surface-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        >
                          {roleOptions.map((r) => (
                            <option key={r} value={r}>{r.replace('_', ' ')}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                          {user.role === 'super_admin' ? 'bg-purple-500/10 text-purple-400' :
                           user.role === 'admin' ? 'bg-blue-500/10 text-blue-400' :
                           'bg-surface-800 text-surface-400'}">
                          {user.role.replace('_', ' ')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === user.id ? (
                        <select
                          value={editForm.status}
                          onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                          className="bg-surface-800 border border-surface-700 rounded px-2 py-1 text-sm text-surface-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        >
                          {statusOptions.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                          ${user.status === 'active' ? 'bg-success-500/10 text-success-400' :
                           user.status === 'inactive' ? 'bg-warning-500/10 text-warning-400' :
                           'bg-error-500/10 text-error-400'}`}>
                          {user.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-surface-300 font-mono text-xs">{user.employee_number}</td>
                    <td className="px-4 py-3 text-surface-300 text-xs">{user.businessId || '-'}</td>
                    <td className="px-4 py-3 text-surface-300">{user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {editingId === user.id ? (
                          <>
                            <button
                              onClick={() => saveEdit(user.id)}
                              className="text-xs px-2 py-1 bg-success-500 hover:bg-success-600 text-white rounded"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs px-2 py-1 bg-surface-700 hover:bg-surface-600 text-surface-300 rounded"
                            >
                              Cancel
                            </button>
                          </>
                        ) : canManage && user.id !== staff?.id ? (
                          <>
                            <button
                              onClick={() => startEdit(user)}
                              className="text-xs px-2 py-1 bg-primary-500 hover:bg-primary-600 text-white rounded"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="text-xs px-2 py-1 bg-error-500 hover:bg-error-600 text-white rounded"
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-surface-500">Current User</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-900 border border-surface-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-surface-100 mb-4">Create Tenant Admin</h2>
            <form onSubmit={submitCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-surface-300 mb-1">Business</label>
                <select
                  value={createForm.business_id}
                  onChange={(e) => setCreateForm({ ...createForm, business_id: e.target.value })}
                  className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  required
                >
                  <option value="">Select a business</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.slug})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-surface-300 mb-1">First Name</label>
                  <input
                    type="text"
                    value={createForm.first_name}
                    onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })}
                    className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-surface-300 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={createForm.last_name}
                    onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })}
                    className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-surface-300 mb-1">Email</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-surface-300 mb-1">Password</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  required
                  minLength={8}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-surface-300 mb-1">Role</label>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                    className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>{r.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-surface-300 mb-1">Status</label>
                  <select
                    value={createForm.status}
                    onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
                    className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="text-sm px-3 py-2 bg-surface-700 hover:bg-surface-600 text-surface-300 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="text-sm px-3 py-2 bg-success-500 hover:bg-success-600 disabled:bg-success-500/50 text-white rounded"
                >
                  {creating ? 'Creating...' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
