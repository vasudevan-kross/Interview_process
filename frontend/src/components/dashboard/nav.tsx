'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { FileCheck, Home, Users, FileText, BarChart3, Settings, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const navItems = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: Home,
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    title: 'Resume Matching',
    href: '/dashboard/resume-matching',
    icon: Users,
    gradient: 'from-purple-500 to-pink-500',
  },
  {
    title: 'Test Evaluation',
    href: '/dashboard/test-evaluation',
    icon: FileText,
    gradient: 'from-orange-500 to-red-500',
  },
  {
    title: 'Analytics',
    href: '/dashboard/analytics',
    icon: BarChart3,
    gradient: 'from-green-500 to-emerald-500',
  },
  {
    title: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
    gradient: 'from-gray-500 to-slate-500',
  },
]

export function DashboardNav() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname.startsWith(href)
  }

  return (
    <aside className={cn(
      'relative h-screen border-r bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 transition-all duration-300 flex flex-col',
      collapsed ? 'w-20' : 'w-72'
    )}>
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-4 justify-between">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-primary/80 shadow-lg">
              <FileCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-base">Interview AI</h1>
              <p className="text-xs text-muted-foreground">Smart Hiring Platform</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-primary/80 shadow-lg mx-auto">
            <FileCheck className="h-5 w-5 text-white" />
          </div>
        )}

        {/* Toggle Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8 p-0 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200',
                active
                  ? 'bg-gradient-to-r ' + item.gradient + ' text-white shadow-lg'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
                collapsed && 'justify-center'
              )}
              title={collapsed ? item.title : undefined}
            >
              <div className={cn(
                'p-2 rounded-lg transition-colors',
                active
                  ? 'bg-white/20'
                  : 'bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200'
              )}>
                <Icon className="h-4 w-4" />
              </div>
              {!collapsed && <span>{item.title}</span>}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
