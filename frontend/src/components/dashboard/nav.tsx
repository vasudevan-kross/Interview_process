'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { FileCheck, Home, Users, FileText, BarChart3, Settings, ChevronLeft, ChevronRight, Menu, X, Video, Code } from 'lucide-react'
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
    title: 'Video Interviews',
    href: '/dashboard/video-interviews',
    icon: Video,
    gradient: 'from-cyan-500 to-blue-500',
  },
  {
    title: 'Coding Interviews',
    href: '/dashboard/coding-interviews',
    icon: Code,
    gradient: 'from-indigo-500 to-purple-500',
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
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [mobileOpen])

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* Mobile Menu Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed left-4 top-4 z-50 md:hidden bg-white shadow-lg hover:bg-slate-100 rounded-lg border border-slate-200"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[45] md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed left-0 top-0 z-[46] h-screen border-r bg-white border-slate-200 transition-all duration-300 flex flex-col',
        // Mobile: slide from left
        '-translate-x-full md:translate-x-0',
        mobileOpen && 'translate-x-0',
        // Desktop: collapsible width
        collapsed ? 'md:w-20' : 'md:w-72',
        // Mobile: always full width when open
        'w-72'
      )}>
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-slate-200 px-4 justify-between shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary">
              <FileCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-base text-slate-900">Interview AI</h1>
              <p className="text-xs text-muted-foreground">Smart Hiring Platform</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="p-2 rounded-lg bg-primary mx-auto">
            <FileCheck className="h-5 w-5 text-white" />
          </div>
        )}

        {/* Toggle Button - Desktop Only */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex h-8 w-8 p-0 hover:bg-slate-100"
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
                'group flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all duration-200',
                active
                  ? 'bg-primary text-white'
                  : 'text-slate-700 hover:bg-slate-100',
                collapsed && 'justify-center'
              )}
              title={collapsed ? item.title : undefined}
            >
              <Icon className="h-4 w-4" />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          )
        })}
      </nav>
    </aside>
    </>
  )
}
