'use client'

import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'flex flex-col gap-4',
        month_caption: 'flex justify-center items-center h-7 relative',
        caption_label: 'text-sm font-semibold text-slate-800',
        nav: 'flex items-center gap-1',
        button_previous: cn(
          'absolute left-1 h-7 w-7 flex items-center justify-center rounded-lg',
          'border border-slate-200 bg-white text-slate-600',
          'hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300',
          'transition-colors'
        ),
        button_next: cn(
          'absolute right-1 h-7 w-7 flex items-center justify-center rounded-lg',
          'border border-slate-200 bg-white text-slate-600',
          'hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300',
          'transition-colors'
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-slate-400 rounded-md w-9 font-medium text-[0.8rem] text-center',
        week: 'flex w-full mt-1',
        day: cn(
          'relative p-0 text-center text-sm focus-within:relative focus-within:z-20'
        ),
        day_button: cn(
          'h-9 w-9 rounded-lg text-sm font-medium transition-all',
          'hover:bg-indigo-50 hover:text-indigo-700',
          'focus:outline-none focus:ring-2 focus:ring-indigo-400'
        ),
        selected: '[&>button]:bg-gradient-to-br [&>button]:from-indigo-600 [&>button]:to-purple-600 [&>button]:text-white [&>button]:hover:from-indigo-700 [&>button]:hover:to-purple-700 [&>button]:shadow-sm',
        today: '[&>button]:border [&>button]:border-indigo-400 [&>button]:text-indigo-700 [&>button]:font-bold',
        outside: '[&>button]:text-slate-300 [&>button]:hover:text-slate-400',
        disabled: '[&>button]:text-slate-200 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  )
}

Calendar.displayName = 'Calendar'
export { Calendar }
