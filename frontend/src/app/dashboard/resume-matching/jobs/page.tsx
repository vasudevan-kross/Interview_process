'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Briefcase, Calendar, Users, ArrowRight, Plus, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { apiClient } from '@/lib/api/client'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface JobDescription {
  id: string
  title: string
  department: string | null
  created_at: string
  parsed_data: {
    file_name?: string
  }
  _count?: {
    resumes: number
  }
}

export default function JobsListPage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<JobDescription[]>([])
  const [loading, setLoading] = useState(true)
  const [resumeCounts, setResumeCounts] = useState<Record<string, number>>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchJobs()
  }, [])

  const fetchJobs = async () => {
    try {
      const supabase = createClient()

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Fetch job descriptions — try both auth user ID and users-table ID
      // (the LLM service stores created_by as auth user ID or users.id depending on signup path)
      const { data: userRecord } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      const userIds = [user.id]
      if (userRecord && userRecord.id !== user.id) userIds.push(userRecord.id)

      const { data: jobsData, error } = await supabase
        .from('job_descriptions')
        .select('id, title, department, created_at, parsed_data')
        .in('created_by', userIds)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching jobs:', error)
        toast.error('Failed to load job descriptions')
        return
      }

      setJobs(jobsData || [])

      // Fetch resume counts for each job
      if (jobsData && jobsData.length > 0) {
        const counts: Record<string, number> = {}

        for (const job of jobsData) {
          const { count } = await supabase
            .from('resumes')
            .select('*', { count: 'exact', head: true })
            .eq('job_description_id', job.id)

          counts[job.id] = count || 0
        }

        setResumeCounts(counts)
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleViewJob = (jobId: string) => {
    router.push(`/dashboard/resume-matching/${jobId}/candidates`)
  }

  const handleUploadResumes = (jobId: string) => {
    router.push(`/dashboard/resume-matching/${jobId}/upload-resumes`)
  }

  const handleDeleteJob = (jobId: string) => {
    setPendingDeleteId(jobId)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteJob = async () => {
    if (!pendingDeleteId) return
    try {
      setDeleting(true)
      await apiClient.deleteJobDescription(pendingDeleteId)
      toast.success('Job description and all resumes deleted')
      setJobs((prev) => prev.filter((j) => j.id !== pendingDeleteId))
      setResumeCounts((prev) => {
        const next = { ...prev }
        delete next[pendingDeleteId]
        return next
      })
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete job description')
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
      setPendingDeleteId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading job descriptions...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Gradient Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500/90 to-pink-600 p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="h-6 w-6" />
                <span className="text-sm font-medium opacity-90">Recruitment Management</span>
              </div>
              <h1 className="text-4xl font-bold mb-2">Job Descriptions</h1>
              <p className="text-lg opacity-90">
                {jobs.length} {jobs.length === 1 ? 'position' : 'positions'} available for candidate matching
              </p>
            </div>
            <Button
              onClick={() => router.push('/dashboard/resume-matching')}
              className="bg-white text-purple-600 hover:bg-purple-50 shadow-lg hover:shadow-xl transition-all"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Job Description
            </Button>
          </div>
        </div>
      </div>

      {jobs.length === 0 ? (
        <Card className="border-0 shadow-lg overflow-hidden">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 mb-6 shadow-lg">
              <Briefcase className="h-12 w-12 text-white" />
            </div>
            <h3 className="text-2xl font-semibold mb-2 text-slate-900">No job descriptions yet</h3>
            <p className="text-muted-foreground mb-8 text-center max-w-md leading-relaxed">
              Create your first job description to start matching candidates with AI-powered algorithms
            </p>
            <Button
              onClick={() => router.push('/dashboard/resume-matching')}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-md hover:shadow-lg transition-all"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Job Description
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => (
            <Card
              key={job.id}
              className="border-0 shadow-lg overflow-hidden relative group hover:shadow-xl transition-all cursor-pointer"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <CardHeader className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 flex gap-4">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-md flex-shrink-0 h-fit">
                      <Briefcase className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-3 text-slate-900 group-hover:text-purple-600 transition-colors">
                        {job.title}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        {job.department && (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-100">
                            <Briefcase className="h-4 w-4" />
                            <span className="font-medium">{job.department}</span>
                          </span>
                        )}
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 border border-slate-100">
                          <Calendar className="h-4 w-4" />
                          <span>{format(new Date(job.created_at), 'MMM d, yyyy')}</span>
                        </span>
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-50 text-pink-700 border border-pink-100">
                          <Users className="h-4 w-4" />
                          <span className="font-medium">{resumeCounts[job.id] || 0} candidates</span>
                        </span>
                      </div>
                      {job.parsed_data?.file_name && (
                        <p className="text-sm text-muted-foreground mt-3 flex items-center gap-1.5">
                          <span className="text-xs px-2 py-1 rounded bg-slate-100 font-mono">
                            {job.parsed_data.file_name}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteJob(job.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      title="Delete job description"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleUploadResumes(job.id)}
                      className="border-purple-200 text-purple-700 hover:bg-purple-50"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Upload Resumes
                    </Button>
                    <Button
                      onClick={() => handleViewJob(job.id)}
                      className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-md hover:shadow-lg transition-all"
                    >
                      <Users className="mr-2 h-4 w-4" />
                      {resumeCounts[job.id] > 0 ? `View ${resumeCounts[job.id]} Candidates` : 'View Candidates'}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDeleteJob}
        title="Delete Job Description"
        description="Are you sure you want to delete this job description? All associated candidate resumes and match scores will also be permanently deleted. This action cannot be undone."
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        variant="destructive"
      />
    </div>
  )
}
