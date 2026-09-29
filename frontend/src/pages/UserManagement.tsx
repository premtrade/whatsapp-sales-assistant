import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getAdminUsers, updateAdminUser, deleteAdminUser } from '@/services/api'
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
        <h1 className="text-2xl font-bold text-surface-100">User Management</h1>
        <p className="text-sm text-surface-400">Manage platform users and their permissions.</p>
      </div>

      <div className="bg-surface-900 border border-surface-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-950 text-surface-400">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Employee #</th>
                <th className="text-left px-4 py-3 font-medium">Business</th>
                <th className="text-left px-4 py-3 font-medium">Created</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
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
    </div>
  )
}