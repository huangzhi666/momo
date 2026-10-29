import { cn } from '@/lib/utils'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-balance sm:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-muted-foreground">{icon}</div> : null}
      <p className="font-serif text-lg font-medium">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: 'default' | 'new' | 'oot'
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span
        className={cn(
          'mt-0.5 text-lg font-semibold leading-tight tabular-nums',
          tone === 'new' && 'text-new',
          tone === 'oot' && 'text-oot',
        )}
      >
        {value}
      </span>
      {hint ? <span className="mt-0.5 text-[11px] text-muted-foreground">{hint}</span> : null}
    </div>
  )
}
