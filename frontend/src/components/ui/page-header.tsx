import * as React from 'react'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

interface PageHeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
  onBack?: () => void
  backHref?: string
}

export function PageHeader({ title, description, action, onBack, backHref }: PageHeaderProps) {
  const BackButton = () => (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0 mr-2 -ml-1 text-slate-500 hover:text-slate-900"
      onClick={onBack}
    >
      <ChevronLeft className="h-5 w-5" />
    </Button>
  )

  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-start">
        {backHref ? (
          <Link href={backHref}>
            <BackButton />
          </Link>
        ) : onBack ? (
          <BackButton />
        ) : null}
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          {description && (
            <p className="text-sm text-slate-500 mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
