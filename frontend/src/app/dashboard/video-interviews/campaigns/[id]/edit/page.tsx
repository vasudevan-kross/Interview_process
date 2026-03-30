'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { SkeletonPageHeader } from '@/components/ui/skeleton'
import { generateVideoQuestions, getVideoCampaign, updateVideoCampaign } from '@/lib/api/video-interviews'
import { toast } from 'sonner'
import { Sparkles, Briefcase, Settings2, BrainCircuit } from 'lucide-react'

export default function EditVideoCampaignPage() {
  const params = useParams()
  const router = useRouter()
  const campaignId = params?.id as string
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [numQuestions, setNumQuestions] = useState(5)
  const [difficulty, setDifficulty] = useState<'low' | 'medium' | 'hard'>('medium')
  const [basis, setBasis] = useState<string[]>(['job_description', 'job_role'])
  const [form, setForm] = useState({
    name: '',
    job_role: '',
    description: '',
    job_description_text: '',
    interview_duration_minutes: 20,
    questionsText: '',
  })

  useEffect(() => {
    if (campaignId) fetchCampaign()
  }, [campaignId])

  const fetchCampaign = async () => {
    try {
      setLoading(true)
      const campaign = await getVideoCampaign(campaignId)
      setForm({
        name: campaign.name,
        job_role: campaign.job_role,
        description: campaign.description || '',
        job_description_text: campaign.job_description_text || '',
        interview_duration_minutes: campaign.interview_duration_minutes,
        questionsText: campaign.questions.map((q) => q.question_text).join('\n'),
      })
      setNumQuestions(campaign.questions.length || 5)
    } catch {
      toast.error('Failed to load campaign')
    } finally {
      setLoading(false)
    }
  }

  const parseQuestions = () => {
    return form.questionsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((question_text) => ({ question_text }))
  }

  const handleSubmit = async () => {
    if (!form.name || !form.job_role) {
      toast.error('Name and role are required')
      return
    }
    try {
      setSaving(true)
      await updateVideoCampaign(campaignId, {
        name: form.name,
        job_role: form.job_role,
        description: form.description || undefined,
        job_description_text: form.job_description_text || undefined,
        interview_duration_minutes: Number(form.interview_duration_minutes) || 20,
        questions: parseQuestions(),
      })
      toast.success('Campaign updated')
      router.push(`/dashboard/video-interviews/campaigns/${campaignId}`)
    } catch {
      toast.error('Failed to update campaign')
    } finally {
      setSaving(false)
    }
  }

  const handleGenerateQuestions = async () => {
    if (!form.job_role) {
      toast.error('Add a job role to generate questions')
      return
    }
    try {
      setGenerating(true)
      const questions = await generateVideoQuestions({
        name: form.name || 'Video Interview',
        job_role: form.job_role,
        description: form.description || undefined,
        job_description_text: form.job_description_text || undefined,
        interview_duration_minutes: Number(form.interview_duration_minutes) || 20,
        num_questions: numQuestions,
        question_difficulty: difficulty,
        question_basis: basis,
      })
      setForm({
        ...form,
        questionsText: questions.map((q) => q.question_text).join('\n'),
      })
      toast.success('Questions generated')
    } catch {
      toast.error('Failed to generate questions')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-[1000px] mx-auto pb-12">
        <SkeletonPageHeader />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-[1000px] mx-auto pb-12">
      <div className="flex items-center gap-4 border-b border-slate-200 pb-6">
        <Link href={`/dashboard/video-interviews/campaigns/${campaignId}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-full">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Edit Campaign</h1>
          <p className="mt-1 text-sm text-slate-500">Update configuration for {form.name || 'this campaign'}.</p>
        </div>
      </div>

      <div className="grid gap-6">
        
        {/* Basic Info Panel */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-slate-50/50 border-b border-slate-100 px-6 py-4 flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-900">Basic Information</h2>
          </div>
          <div className="p-6 grid gap-6 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Campaign name <span className="text-red-500">*</span></label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition-colors focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="e.g. Frontend Engineer Q3"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Job role <span className="text-red-500">*</span></label>
              <input
                value={form.job_role}
                onChange={(e) => setForm({ ...form, job_role: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition-colors focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="e.g. Senior React Developer"
              />
            </div>

            <div className="grid gap-2 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Internal Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm transition-colors focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none"
                rows={2}
                placeholder="Short summary for recruiters to understand the goal of this campaign."
              />
            </div>
          </div>
        </div>

        {/* AI Configuration Panel */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-slate-50/50 border-b border-slate-100 px-6 py-4 flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-slate-900">AI Context & Duration</h2>
          </div>
          <div className="p-6 grid gap-6">
            
            <div className="grid gap-6 md:grid-cols-12">
              <div className="grid gap-2 md:col-span-9">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Job Description (For AI Context)</label>
                <textarea
                  value={form.job_description_text}
                  onChange={(e) => setForm({ ...form, job_description_text: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm transition-colors focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none"
                  rows={4}
                  placeholder="Paste the full job description here. The AI will use this to generate targeted questions and evaluate candidate responses."
                />
              </div>

              <div className="grid gap-2 md:col-span-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Duration (Min)</label>
                <input
                  type="number"
                  min={5}
                  value={form.interview_duration_minutes}
                  onChange={(e) => setForm({ ...form, interview_duration_minutes: Number(e.target.value) })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition-colors focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

          </div>
        </div>

        {/* Interview Questions Panel */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
          <div className="bg-slate-50/50 border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-orange-500" />
              <h2 className="text-sm font-semibold text-slate-900">Interview Questions</h2>
            </div>
            
            {/* Generator Controls inside the header */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-2 py-1 shadow-sm">
                <span className="text-[10px] uppercase font-bold text-slate-400 ml-1">Count:</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(Number(e.target.value))}
                  className="w-12 h-6 text-xs text-center border-none outline-none focus:ring-0 bg-transparent p-0 font-medium text-slate-700"
                />
              </div>

              <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-2 shadow-sm h-8">
                <span className="text-[10px] uppercase font-bold text-slate-400">Level:</span>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as 'low' | 'medium' | 'hard')}
                  className="h-full text-xs border-none outline-none focus:ring-0 bg-transparent py-0 pl-1 pr-6 font-medium text-slate-700"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              <Button
                type="button"
                size="sm"
                className="h-8 bg-slate-900 hover:bg-slate-800 text-xs font-semibold shadow-sm gap-1.5"
                onClick={handleGenerateQuestions}
                disabled={generating}
              >
                <Sparkles className="h-3 w-3 text-indigo-400" />
                {generating ? 'Generating...' : 'Auto-Generate'}
              </Button>
            </div>
          </div>
          
          <div className="p-6 grid gap-6">
             <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 flex flex-wrap items-center gap-4">
                <span className="text-xs font-semibold text-amber-800">Note: Modifying questions will only affect new ongoing sessions.</span>
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Question List (One Per Line)</label>
              <textarea
                value={form.questionsText}
                onChange={(e) => setForm({ ...form, questionsText: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm transition-colors focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none leading-relaxed"
                rows={8}
                placeholder="1. Tell me about a project you're proud of...&#10;2. How do you handle merge conflicts?&#10;3. What are the advantages of Server Components?"
              />
              <p className="text-[11px] text-slate-400 font-medium">Use the generator above to auto-fill based on the job description, or manually type your questions.</p>
            </div>
            
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex flex-wrap items-center gap-4">
               <span className="text-xs font-semibold uppercase text-slate-500">Question Basis filters:</span>
               {['job_description', 'job_role', 'skills', 'behavioral'].map((item) => (
                  <label key={item} className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm transition hover:border-slate-300">
                    <input
                      type="checkbox"
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                      checked={basis.includes(item)}
                      onChange={(e) => {
                        if (e.target.checked) setBasis([...basis, item])
                        else setBasis(basis.filter((b) => b !== item))
                      }}
                    />
                    {item.replace('_', ' ')}
                  </label>
                ))}
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-end gap-4 pt-4 border-t border-slate-200">
          <Link href={`/dashboard/video-interviews/campaigns/${campaignId}`}>
            <Button variant="ghost" className="font-semibold text-slate-600 hover:text-slate-900">
              Cancel
            </Button>
          </Link>
          <Button onClick={handleSubmit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 shadow-sm font-semibold px-8">
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>

      </div>
    </div>
  )
}
