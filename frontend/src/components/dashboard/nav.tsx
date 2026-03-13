'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { FileCheck, Home, Users, FileText, Settings, ChevronLeft, ChevronRight, Menu, X, Code, Phone, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'

const navItems = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: Home,
  },
  {
    title: 'Interview Pipeline',
    href: '/dashboard/pipeline',
    icon: GitBranch,
  },
  {
    title: 'Resume Matching',
    href: '/dashboard/resume-matching',
    icon: Users,
  },
  {
    title: 'Test Evaluation',
    href: '/dashboard/test-evaluation',
    icon: FileText,
  },
  {
    title: 'Technical Assessments',
    href: '/dashboard/coding-interviews',
    icon: Code,
  },
  {
    title: 'Voice Screening',
    href: '/dashboard/voice-screening',
    icon: Phone,
  },
]

const settingsItem = {
  title: 'Settings',
  href: '/dashboard/settings',
  icon: Settings,
}

export function DashboardNav() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

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

  const NavLink = ({ item }: { item: typeof navItems[0] }) => {
    const Icon = item.icon
    const active = isActive(item.href)

    return (
      <Link
        href={item.href}
        prefetch={true}
        className={cn(
          'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150',
          active
            ? 'bg-slate-800 text-white border-l-2 border-indigo-500 pl-[10px]'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border-l-2 border-transparent pl-[10px]',
          collapsed && 'justify-center pl-0 border-l-0'
        )}
        title={collapsed ? item.title : undefined}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{item.title}</span>}
      </Link>
    )
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
        'fixed left-0 top-0 z-[46] h-screen border-r bg-slate-950 border-slate-800/60 transition-all duration-300 flex flex-col',
        '-translate-x-full md:translate-x-0',
        mobileOpen && 'translate-x-0',
        collapsed ? 'md:w-16' : 'md:w-64',
        'w-64'
      )}>
        {/* Logo */}
        <div className={cn(
          'flex h-16 items-center border-b border-slate-800/60 px-4 shrink-0',
          collapsed ? 'justify-between' : 'justify-between'
        )}>
          {!collapsed && (
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-md bg-indigo-600 shrink-0">
                <FileCheck className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="font-semibold text-sm text-white">Interview AI</h1>
                <p className="text-xs text-slate-500">Smart Hiring Platform</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="p-1.5 rounded-md bg-indigo-600">
              <FileCheck className="h-4 w-4 text-white" />
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex h-7 w-7 p-0 text-slate-400 hover:text-slate-200 hover:bg-slate-800 shrink-0"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 overflow-y-auto sidebar-scrollbar">
          {/* Section label */}
          {!collapsed && (
            <p className="px-3 py-2 text-xs font-medium text-slate-600 uppercase tracking-widest">
              Modules
            </p>
          )}
          <div className="space-y-0.5">
            {navItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>

          {/* Settings section */}
          {!collapsed && (
            <p className="px-3 py-2 mt-4 text-xs font-medium text-slate-600 uppercase tracking-widest">
              Account
            </p>
          )}
          {collapsed && <div className="mt-4" />}
          <NavLink item={settingsItem} />
        </nav>

      </aside>
    </>
  )
}
