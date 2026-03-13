import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground border-slate-200",
        success:
          "border-green-200 bg-green-50 text-green-700",
        warning:
          "border-yellow-200 bg-yellow-50 text-yellow-700",
        // Semantic status variants
        "status-active":
          "border-green-200 bg-green-50 text-green-700",
        "status-pending":
          "border-blue-200 bg-blue-50 text-blue-700",
        "status-inactive":
          "border-slate-200 bg-slate-50 text-slate-600",
        "status-error":
          "border-red-200 bg-red-50 text-red-700",
        "status-info":
          "border-indigo-200 bg-indigo-50 text-indigo-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
