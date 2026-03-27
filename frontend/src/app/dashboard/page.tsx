import { redirect } from 'next/navigation'

export default function DashboardPage() {
  // Redirect the root dashboard path to the hiring campaigns page
  redirect('/dashboard/campaigns')
}
