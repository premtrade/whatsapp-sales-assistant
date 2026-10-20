import { useEffect } from 'react'
import { buildMetaTags, SEO_MANAGED_ATTR, type SeoConfig } from '@/seo/meta'

/**
 * Applies page metadata to <head> at runtime so client-side navigation keeps
 * title, canonical, Open Graph and Twitter tags correct.
 *
 * Static HTML for the same metadata is produced at build time by
 * `scripts/prerender.mjs`, which reads the same `buildMetaTags` output — the
 * two paths cannot drift.
 */
export default function Seo({ config }: { config: SeoConfig }) {
  const { title, tags } = buildMetaTags(config)

  useEffect(() => {
    document.title = title

    // Drop tags from a previous route so repeated navigation never accumulates
    // duplicates in <head>. Prerendered tags carry the same marker, so they
    // are replaced rather than doubled.
    document.head.querySelectorAll(`[${SEO_MANAGED_ATTR}]`).forEach((el) => el.remove())

    for (const tag of tags) {
      let element: HTMLElement

      if (tag.tag === 'script') {
        const script = document.createElement('script')
        script.type = 'application/ld+json'
        script.textContent = tag.content ?? ''
        element = script
      } else if (tag.tag === 'link') {
        const link = document.createElement('link')
        link.rel = tag.attrs.rel ?? ''
        link.href = tag.attrs.href ?? ''
        element = link
      } else {
        const meta = document.createElement('meta')
        for (const [key, value] of Object.entries(tag.attrs)) {
          meta.setAttribute(key, value)
        }
        element = meta
      }

      element.setAttribute(SEO_MANAGED_ATTR, 'true')
      document.head.appendChild(element)
    }
  }, [title, tags])

  return null
}
