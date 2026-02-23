import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, FileText, TrendingUp, Clock } from 'lucide-react'

export default async function DashboardPage() {
  // TODO: Fetch real data from backend
  const stats = [
    {
      title: 'Total Candidates',
      value: '0',
      description: 'Resumes processed',
      icon: Users,
      color: 'text-blue-600',
    },
    {
      title: 'Active Tests',
      value: '0',
      description: 'Tests in progress',
      icon: FileText,
      color: 'text-green-600',
    },
    {
      title: 'Average Match Score',
      value: '0%',
      description: 'Resume matching',
      icon: TrendingUp,
      color: 'text-purple-600',
    },
    {
      title: 'Pending Evaluations',
      value: '0',
      description: 'Awaiting review',
      icon: Clock,
      color: 'text-orange-600',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to your interview management dashboard
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <a
              href="/dashboard/resume-matching"
              className="block p-4 border rounded-lg hover:bg-muted transition-colors"
            >
              <h3 className="font-semibold mb-1">Upload Job Description</h3>
              <p className="text-sm text-muted-foreground">
                Start a new resume matching round
              </p>
            </a>
            <a
              href="/dashboard/test-evaluation"
              className="block p-4 border rounded-lg hover:bg-muted transition-colors"
            >
              <h3 className="font-semibold mb-1">Create Test</h3>
              <p className="text-sm text-muted-foreground">
                Upload a question paper for evaluation
              </p>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              No recent activity yet. Start by uploading a job description or creating a test.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
