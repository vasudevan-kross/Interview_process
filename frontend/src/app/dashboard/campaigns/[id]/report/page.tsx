'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Download, FileText, ArrowLeft, BarChart3, Target, Trophy } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { SkeletonPageHeader, SkeletonTable } from '@/components/ui/skeleton'
import { toast } from 'sonner'

export default function CampaignReportPage() {
  const params = useParams()
  const campaignId = params.id as string
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReport()
  }, [campaignId])

  const loadReport = async () => {
    try {
      setLoading(true)
      const data = await apiClient.getCampaignReport(campaignId)
      setReport(data)
    } catch (error: any) {
      console.error('Error loading campaign report:', error)
      toast.error('Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(url)
  }

  const handleDownloadCsv = async () => {
    try {
      const blob = await apiClient.downloadCampaignReportCsv(campaignId)
      downloadBlob(blob, `campaign_${campaignId}.csv`)
    } catch (error: any) {
      console.error('Error downloading CSV:', error)
      toast.error('Failed to download CSV')
    }
  }

  const handleDownloadPdf = async () => {
    try {
      const blob = await apiClient.downloadCampaignReportPdf(campaignId)
      downloadBlob(blob, `campaign_${campaignId}.pdf`)
    } catch (error: any) {
      console.error('Error downloading PDF:', error)
      toast.error('Failed to download PDF')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonPageHeader />
        <SkeletonTable rows={6} cols={6} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/dashboard/campaigns/${campaignId}`} className="text-sm text-slate-600 hover:text-slate-900">
          <span className="inline-flex items-center">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Batch
          </span>
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadCsv}>
            <Download className="w-4 h-4 mr-2" />
            Download CSV
          </Button>
          <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handleDownloadPdf}>
            <FileText className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      <PageHeader
        title="Batch Report"
        description="Summary of batch performance and candidate outcomes"
      />

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs text-slate-500">Batch</div>
            <div className="text-lg font-semibold text-slate-900">
              {report?.campaign?.name || 'Batch'}
            </div>
          </div>
          <span className="inline-flex rounded-md bg-slate-100 text-slate-700 text-xs font-medium px-2 py-1">
            {report?.campaign?.status || 'active'}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              Total Candidates
            </div>
            <div className="text-2xl font-semibold tabular-nums text-slate-900 mt-1">
              {report?.summary?.total_candidates || 0}
            </div>
          </div>
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Target className="w-4 h-4 text-indigo-500" />
              Unique Jobs
            </div>
            <div className="text-2xl font-semibold tabular-nums text-slate-900 mt-1">
              {report?.summary?.unique_jobs || 0}
            </div>
          </div>
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Trophy className="w-4 h-4 text-indigo-500" />
              Avg Resume Score
            </div>
            <div className="text-2xl font-semibold tabular-nums text-slate-900 mt-1">
              {report?.summary?.avg_resume_score
                ? `${Number(report.summary.avg_resume_score).toFixed(1)}%`
                : '-'}
            </div>
          </div>
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Trophy className="w-4 h-4 text-indigo-500" />
              Avg Coding Score
            </div>
            <div className="text-2xl font-semibold tabular-nums text-slate-900 mt-1">
              {report?.summary?.avg_coding_score
                ? `${Number(report.summary.avg_coding_score).toFixed(1)}%`
                : '-'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-sm font-medium text-slate-900 mb-3">Stage Breakdown</div>
          <div className="space-y-2 text-sm">
            {Object.entries(report?.summary?.by_stage || {}).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-slate-600">{key.replace('_', ' ')}</span>
                <span className="text-slate-900 font-medium tabular-nums">{value as number}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-sm font-medium text-slate-900 mb-3">Decision Breakdown</div>
          <div className="space-y-2 text-sm">
            {Object.entries(report?.summary?.by_decision || {}).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-slate-600">{key.replace('_', ' ')}</span>
                <span className="text-slate-900 font-medium tabular-nums">{value as number}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {report?.job_summary?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mt-6">
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium">Job Summary</div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Job</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Total</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Resume</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Technical</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Voice</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {report.job_summary.map((row: any, idx: number) => (
                <tr key={idx}>
                  <td className="px-3 py-2 text-slate-900">{row.job_title}</td>
                  <td className="px-3 py-2">{row.total_count}</td>
                  <td className="px-3 py-2">{row.resume_screening_count}</td>
                  <td className="px-3 py-2">{row.technical_assessment_count}</td>
                  <td className="px-3 py-2">{row.voice_screening_count}</td>
                  <td className="px-3 py-2">{row.completed_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Candidate Details Table */}
      {report?.candidates?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mt-6 overflow-x-auto">
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium flex justify-between items-center">
            <span>Candidate Detailed Statistics</span>
            <span className="text-xs text-slate-500 font-normal">{report.candidates.length} candidates found</span>
          </div>
          <table className="min-w-full text-sm whitespace-nowrap">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Candidate Name</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Slot / Job</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Current Stage</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Resume Match</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Coding Score</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Voice Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">AI Recommendation</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Final Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {report.candidates.map((cand: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-900 font-medium">
                    {cand.candidate_name}
                    <div className="text-xs text-slate-500 font-normal">{cand.candidate_email}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    <div>{cand.slot_name || 'No slot'}</div>
                    <div className="text-xs text-slate-400">{cand.job_title || 'N/A'}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
                      {cand.current_stage?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {cand.resume_match_score != null ? (
                      <span className={`font-medium ${cand.resume_match_score >= 80 ? 'text-green-600' : cand.resume_match_score >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                        {Number(cand.resume_match_score).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {cand.coding_score != null ? (
                      <span className={`font-medium ${cand.coding_score >= 80 ? 'text-green-600' : cand.coding_score >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                        {cand.coding_score} pts
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {cand.voice_status ? (
                      <span className="capitalize text-indigo-700 font-medium">{cand.voice_status.replace('_', ' ')}</span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium
                      ${cand.recommendation === 'highly_recommended' ? 'bg-green-100 text-green-800'
                        : cand.recommendation === 'recommended' ? 'bg-emerald-50 text-emerald-700'
                        : cand.recommendation === 'not_recommended' ? 'bg-red-50 text-red-700'
                        : 'bg-slate-100 text-slate-600'}`}>
                      {cand.recommendation?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium
                      ${cand.final_decision === 'selected' ? 'bg-green-100 text-green-800'
                        : cand.final_decision === 'rejected' ? 'bg-red-100 text-red-800'
                        : cand.final_decision === 'hold' ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'}`}>
                      {cand.final_decision}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

