'use client'

import { usePathname } from 'next/navigation'
import { DashboardNav } from './nav'

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  
  // Hide the navigation and remove padding on report pages
  const isReportPage = pathname?.endsWith('/report') || pathname?.includes('/statistics')

  return (
    <>
      {!isReportPage && <DashboardNav />}
      <div className={`transition-all duration-300 ${!isReportPage ? 'md:pl-64' : ''}`}>
        {children}
      </div>
    </>
  )
}
