import type { ReactNode } from 'react'

/**
 * A consistent section header.
 *
 * Left aligned with a small eyebrow above the title. Centring every heading
 * on the page is what made the old layout feel like a template; this rhythm
 * reads more like a product page.
 */
export default function SectionHeading({
  eyebrow,
  title,
  lede,
  align = 'left',
  className = '',
  children,
}: {
  eyebrow?: string
  title: ReactNode
  lede?: ReactNode
  align?: 'left' | 'center'
  className?: string
  children?: ReactNode
}) {
  const centred = align === 'center'
  return (
    <div className={`${centred ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'} ${className}`}>
      {eyebrow && (
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary-700">
          {!centred && <span className="h-1.5 w-1.5 rounded-full bg-primary-500" aria-hidden="true" />}
          {eyebrow}
        </p>
      )}
      <h2 className="mt-3 text-2xl sm:text-3xl lg:text-[2.1rem] font-bold tracking-tight text-surface-950 leading-[1.15]">
        {title}
      </h2>
      {lede && <p className="mt-3 text-base sm:text-lg leading-relaxed text-surface-600">{lede}</p>}
      {children}
    </div>
  )
}
