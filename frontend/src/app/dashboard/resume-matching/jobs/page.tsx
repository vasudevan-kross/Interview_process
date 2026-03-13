'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Trash2, Users, Upload, Eye } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { apiClient } from '@/lib/api/client'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonTable } from '@/components/ui/skeleton'

interface JobDescription {
  id: string
  title: string
  department: string | null
  created_at: string
  parsed_data: {
    file_name?: string
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
  const [jdDialogOpen, setJdDialogOpen] = useState(false)
  const [jdDetails, setJdDetails] = useState<any>(null)
  const [jdLoading, setJdLoading] = useState(false)

  useEffect(() => {
    fetchJobs()
  }, [])

  const fetchJobs = async () => {
    try {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

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
      toast.error('Failed to load job descriptions')
    } finally {
      setLoading(false)
    }
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
        delete next[pendingDeleteId!]
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

  const handleViewJD = async (jobId: string) => {
    setJdDetails(null)
    setJdDialogOpen(true)
    setJdLoading(true)
    try {
      const data = await apiClient.getJobDescription(jobId)
      setJdDetails(data)
    } catch (error) {
      toast.error('Failed to load job description')
      setJdDialogOpen(false)
    } finally {
      setJdLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job Descriptions"
        description={`${jobs.length} ${jobs.length === 1 ? 'position' : 'positions'} available for candidate matching.`}
        action={
          <Button onClick={() => router.push('/dashboard/resume-matching')}>
            <Plus className="mr-2 h-4 w-4" />
            New Job Description
          </Button>
        }
      />

      {loading ? (
        <SkeletonTable rows={4} cols={5} />
      ) : jobs.length === 0 ? (
        <Card className="border border-slate-200 bg-white">
          <CardContent>
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-slate-900 mb-1">No job descriptions yet</p>
              <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">
                Create your first job description to start matching candidates with AI.
              </p>
              <Button onClick={() => router.push('/dashboard/resume-matching')}>
                <Plus className="mr-2 h-4 w-4" />
                Create Job Description
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Candidates</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium text-slate-900">{job.title}</TableCell>
                  <TableCell className="text-slate-600">{job.department || '—'}</TableCell>
                  <TableCell className="text-slate-600">
                    {format(new Date(job.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {resumeCounts[job.id] ?? 0}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleViewJD(job.id)}
                        title="View job description"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push(`/dashboard/resume-matching/${job.id}/upload-resumes`)}
                        title="Upload resumes"
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push(`/dashboard/resume-matching/${job.id}/candidates`)}
                        title="View candidates"
                      >
                        <Users className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteJob(job.id)}
                        title="Delete"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
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

      {/* Job Description Detail Dialog */}
      <Dialog open={jdDialogOpen} onOpenChange={setJdDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{jdDetails?.title || 'Job Description'}</DialogTitle>
          </DialogHeader>
          {jdLoading ? (
            <div className="py-8 text-center text-sm text-slate-500">Loading...</div>
          ) : jdDetails ? (
            <div className="space-y-5">
              {/* Meta */}
              <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                {jdDetails.department && (
                  <span><span className="font-medium">Department:</span> {jdDetails.department}</span>
                )}
                {jdDetails.created_at && (
                  <span><span className="font-medium">Created:</span> {format(new Date(jdDetails.created_at), 'MMM d, yyyy')}</span>
                )}
                {jdDetails.parsed_data?.file_name && (
                  <span><span className="font-medium">File:</span> {jdDetails.parsed_data.file_name}</span>
                )}
              </div>

              {/* Required Skills */}
              {jdDetails.parsed_data?.required_skills?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Required Skills</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {jdDetails.parsed_data.required_skills.map((skill: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">{skill}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Nice to have */}
              {jdDetails.parsed_data?.preferred_skills?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Preferred Skills</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {jdDetails.parsed_data.preferred_skills.map((skill: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs">{skill}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Experience */}
              {jdDetails.parsed_data?.experience_required && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-1">Experience Required</h4>
                  <p className="text-sm text-slate-600">{jdDetails.parsed_data.experience_required}</p>
                </div>
              )}

              {/* Raw JD text */}
              {jdDetails.raw_text && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Full Job Description</h4>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-64 overflow-y-auto">
                    <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                      {jdDetails.raw_text}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
