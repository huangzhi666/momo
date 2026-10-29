import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5 transition-colors [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/12 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border bg-transparent text-muted-foreground',
        new: 'border-new/30 bg-new-soft text-new',
        oot: 'border-oot/30 bg-oot-soft text-oot',
        success:
          'border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        warning: 'border-amber-600/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        danger: 'border-destructive/25 bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
