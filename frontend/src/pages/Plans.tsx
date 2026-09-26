import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import {
  adminListPlans,
  adminCreatePlan,
  adminUpdatePlan,
  adminDeletePlan,
} from '@/services/api'
import type { Plan } from '@/types'

function emptyPlan(): Partial<Plan> {
  return {
    name: '',
    slug: '',
    price_monthly: 0,
    price_yearly: null,
    currency: 'USD',
    features: {},
    limits: {},
    sort_order: 0,
    is_active: true,
    is_public: true,
    metadata: {},
  }
}

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<Partial<Plan>>(emptyPlan())
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await adminListPlans()
      setPlans(data)
    } catch (error) {
      toast.error('Failed to load plans')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const startCreate = () => {
    setEditing(null)
    setForm(emptyPlan())
    setCreating(true)
  }

  const startEdit = (plan: Plan) => {
    setEditing(plan)
    setForm({
      name: plan.name,
      slug: plan.slug,
      price_monthly: plan.price_monthly,
      price_yearly: plan.price_yearly ?? null,
      currency: plan.currency,
      features: plan.features,
      limits: plan.limits,
      sort_order: plan.sort_order,
      is_active: plan.is_active,
      is_public: plan.is_public,
      metadata: plan.metadata,
    })
    setCreating(false)
  }

  const handleSave = async () => {
    if (!form.name || !form.slug || form.price_monthly == null) {
      toast.error('Name, slug, and monthly price are required')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await adminUpdatePlan(editing.id, form)
        toast.success('Plan updated')
      } else {
        await adminCreatePlan(form)
        toast.success('Plan created')
      }
      setCreating(false)
      setEditing(null)
      setForm(emptyPlan())
      load()
    } catch (error) {
      toast.error('Failed to save plan')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deactivate this plan? Existing subscribers will not be affected.')) return
    try {
      await adminDeletePlan(id)
      toast.success('Plan deactivated')
      load()
    } catch (error) {
      toast.error('Failed to deactivate plan')
    }
  }

  const cancel = () => {
    setCreating(false)
    setEditing(null)
    setForm(emptyPlan())
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-100">Plans</h1>
          <p className="text-sm text-surface-400">Manage subscription plans and pricing</p>
        </div>
        <button
          onClick={startCreate}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          New Plan
        </button>
      </div>

      {(creating || editing) && (
        <div className="bg-surface-900 border border-surface-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-surface-100">
            {editing ? 'Edit Plan' : 'New Plan'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1">Name</label>
              <input
                className="w-full rounded-lg bg-surface-950 border border-surface-800 px-3 py-2 text-sm text-surface-100"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Starter"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1">Slug</label>
              <input
                className="w-full rounded-lg bg-surface-950 border border-surface-800 px-3 py-2 text-sm text-surface-100"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="starter"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1">Monthly Price (USD)</label>
              <input
                type="number"
                className="w-full rounded-lg bg-surface-950 border border-surface-800 px-3 py-2 text-sm text-surface-100"
                value={form.price_monthly}
                onChange={(e) => setForm({ ...form, price_monthly: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1">Yearly Price (USD)</label>
              <input
                type="number"
                className="w-full rounded-lg bg-surface-950 border border-surface-800 px-3 py-2 text-sm text-surface-100"
                value={form.price_yearly ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    price_yearly: e.target.value ? parseFloat(e.target.value) : null,
                  })
                }
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1">Sort Order</label>
              <input
                type="number"
                className="w-full rounded-lg bg-surface-950 border border-surface-800 px-3 py-2 text-sm text-surface-100"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value || '0', 10) })}
              />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-surface-300">
                <input
                  type="checkbox"
                  checked={!!form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm text-surface-300">
                <input
                  type="checkbox"
                  checked={!!form.is_public}
                  onChange={(e) => setForm({ ...form, is_public: e.target.checked })}
                />
                Public
              </label>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={cancel}
              className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-surface-200 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-surface-900 border border-surface-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-950 text-surface-400">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Slug</th>
              <th className="text-left px-4 py-3 font-medium">Monthly</th>
              <th className="text-left px-4 py-3 font-medium">Yearly</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-surface-500">
                  Loading...
                </td>
              </tr>
            ) : plans.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-surface-500">
                  No plans found.
                </td>
              </tr>
            ) : (
              plans.map((plan) => (
                <tr key={plan.id} className="hover:bg-surface-800/50">
                  <td className="px-4 py-3 text-surface-100 font-medium">{plan.name}</td>
                  <td className="px-4 py-3 text-surface-300">{plan.slug}</td>
                  <td className="px-4 py-3 text-surface-300">${plan.price_monthly}</td>
                  <td className="px-4 py-3 text-surface-300">
                    {plan.price_yearly != null ? `$${plan.price_yearly}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        plan.is_active ? 'bg-success-500/10 text-success-400' : 'bg-surface-800 text-surface-400'
                      }`}
                    >
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => startEdit(plan)}
                      className="text-primary-400 hover:text-primary-300 text-xs font-medium mr-3"
                    >
                      Edit
                    </button>
                    {plan.is_active && (
                      <button
                        onClick={() => handleDelete(plan.id)}
                        className="text-danger-400 hover:text-danger-300 text-xs font-medium"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
