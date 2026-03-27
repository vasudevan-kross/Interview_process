'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { TimePicker } from '@/components/ui/time-picker'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'

interface Slot {
  name: string
  time_start: string
  time_end: string
  description: string
}

export default function CreateCampaignPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  })
  const [slots, setSlots] = useState<Slot[]>([
    { name: 'Morning Slot', time_start: '09:00', time_end: '12:00', description: '' },
  ])

  const addSlot = () => {
    setSlots([...slots, { name: '', time_start: '', time_end: '', description: '' }])
  }

  const removeSlot = (index: number) => {
    setSlots(slots.filter((_, i) => i !== index))
  }

  const updateSlot = (index: number, field: keyof Slot, value: string) => {
    const updated = [...slots]
    updated[index][field] = value
    setSlots(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      alert('Batch name is required')
      return
    }

    setLoading(true)
    try {
      // Filter out empty slots
      const validSlots = slots.filter(
        (s) => s.name.trim() && s.time_start.trim() && s.time_end.trim()
      )

      const campaign = await apiClient.createCampaign({
        name: formData.name,
        description: formData.description || undefined,
        metadata: {
          slots: validSlots,
          target_roles: [],
          settings: {},
        },
      })

      router.push(`/dashboard/campaigns/${campaign.id}`)
    } catch (error: any) {
      console.error('Error creating campaign:', error)
      alert(error.response?.data?.detail || 'Failed to create batch')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <Link
        href="/dashboard/campaigns"
        className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to Batches
      </Link>

      <div className="bg-white border border-slate-200 rounded-lg p-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-6">Create New Batch</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Campaign Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Batch Name <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="e.g., Java Developers - March 2026"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Description
            </label>
            <Textarea
              placeholder="Brief description of this batch..."
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          {/* Interview Slots */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-medium text-slate-700">
                Interview Slots
              </label>
              <Button type="button" variant="outline" size="sm" onClick={addSlot}>
                <Plus className="w-4 h-4 mr-1" />
                Add Slot
              </Button>
            </div>

            <div className="space-y-4">
              {slots.map((slot, index) => (
                <div
                  key={index}
                  className="border border-slate-200 rounded-lg p-4 bg-slate-50"
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-sm font-medium text-slate-700">
                      Slot {index + 1}
                    </span>
                    {slots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSlot(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Slot Name</label>
                      <Input
                        type="text"
                        placeholder="e.g., Morning Slot"
                        value={slot.name}
                        onChange={(e) => updateSlot(index, 'name', e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Start Time</label>
                        <TimePicker
                          value={slot.time_start}
                          onChange={(value) => updateSlot(index, 'time_start', value)}
                          placeholder="Select start time"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">End Time</label>
                        <TimePicker
                          value={slot.time_end}
                          onChange={(value) => updateSlot(index, 'time_end', value)}
                          placeholder="Select end time"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="block text-xs text-slate-600 mb-1">
                      Description (Optional)
                    </label>
                    <Input
                      type="text"
                      placeholder="Additional details about this slot..."
                      value={slot.description}
                      onChange={(e) => updateSlot(index, 'description', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-6 border-t border-slate-200">
            <Link href="/dashboard/campaigns">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {loading ? 'Creating...' : 'Create Batch'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
