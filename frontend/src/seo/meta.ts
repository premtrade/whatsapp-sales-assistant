export type JsonLd = Record<string, unknown>

export type SeoConfig = {
  title: string
  description: string
  path: string
  image?: string
  type?: 'website' | 'article'
  publishedTime?: string
  jsonLd?: JsonLd[]
  noindex?: boolean
}

export type MetaTag = {
  tag: string
  attrs: Record<string, string>
  content?: string
}

export const SITE_ORIGIN = 'https://waflo.vercel.app'
export const SITE_NAME = 'WAFLO'
export const OG_IMAGE_PATH = '/og.png'

export const ORGANIZATION: JsonLd = {
  '@type': 'Organization',
  '@id': `${SITE_ORIGIN}/#organization`,
  name: 'ROLINJ.IO',
  url: 'https://rolin-io.vercel.app/',
  email: 'premtrade_ja@outlook.com',
  telephone: '+1-876-799-8637',
  logo: `${SITE_ORIGIN}${OG_IMAGE_PATH}`,
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Kingston',
    addressCountry: 'JM',
  },
  slogan: 'Automation and AI solutions for Caribbean SMEs',
  description:
    'ROLINJ.IO builds automation and AI solutions for small and medium enterprises across Jamaica and the Caribbean.',
}

export const SOFTWARE_APPLICATION: JsonLd = {
  '@type': 'SoftwareApplication',
  '@id': `${SITE_ORIGIN}/#software`,
  name: 'WAFLO',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: `${SITE_ORIGIN}/`,
  description:
    'WAFLO is a managed AI sales assistant for WhatsApp. It answers inbound messages, qualifies leads, sends quotes from your own price list, books appointments, and hands off to a person when needed.',
  provider: { '@id': `${SITE_ORIGIN}/#organization` },
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'USD',
    lowPrice: '79',
    highPrice: '399',
    offerCount: '3',
    url: `${SITE_ORIGIN}/#pricing`,
  },
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}

export function buildTitle(title: string): string {
  return title === SITE_NAME ? `${SITE_NAME} — AI Sales Assistant for WhatsApp` : `${title} | ${SITE_NAME}`
}

/**
 * Single source of truth for page metadata.
 *
 * Consumed by the runtime <Seo /> component (client-side navigation) and by the
 * build-time prerender script (static HTML for crawlers and link previews).
 * Both paths must produce identical tags, so this function stays pure and
 * framework-free.
 */
export function buildMetaTags(cfg: SeoConfig): { title: string; tags: MetaTag[] } {
  const url = absoluteUrl(cfg.path)
  const image = absoluteUrl(cfg.image || OG_IMAGE_PATH)
  const type = cfg.type || 'website'

  const tags: MetaTag[] = [
    { tag: 'meta', attrs: { name: 'description', content: cfg.description } },
    { tag: 'link', attrs: { rel: 'canonical', href: url } },
    { tag: 'meta', attrs: { property: 'og:site_name', content: SITE_NAME } },
    { tag: 'meta', attrs: { property: 'og:type', content: type } },
    { tag: 'meta', attrs: { property: 'og:title', content: cfg.title } },
    { tag: 'meta', attrs: { property: 'og:description', content: cfg.description } },
    { tag: 'meta', attrs: { property: 'og:url', content: url } },
    { tag: 'meta', attrs: { property: 'og:image', content: image } },
    { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
    { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
    { tag: 'meta', attrs: { property: 'og:image:alt', content: 'WAFLO — AI sales assistant for WhatsApp' } },
    { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
    { tag: 'meta', attrs: { name: 'twitter:title', content: cfg.title } },
    { tag: 'meta', attrs: { name: 'twitter:description', content: cfg.description } },
    { tag: 'meta', attrs: { name: 'twitter:image', content: image } },
  ]

  if (type === 'article' && cfg.publishedTime) {
    tags.push({ tag: 'meta', attrs: { property: 'article:published_time', content: cfg.publishedTime } })
  }

  if (cfg.noindex) {
    tags.push({ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' } })
  }

  for (const item of cfg.jsonLd || []) {
    tags.push({
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      content: JSON.stringify(item),
    })
  }

  return { title: buildTitle(cfg.title), tags }
}

/**
 * Tags written by the prerender step carry the same marker the runtime <Seo />
 * component uses, so a client-side navigation replaces the static tags instead
 * of duplicating them.
 */
export const SEO_MANAGED_ATTR = 'data-waflo-seo'

export function metaTagToHtml(tag: MetaTag): string {
  const attrs = Object.entries(tag.attrs)
    .map(([k, v]) => `${k}="${escapeAttribute(v)}"`)
    .join(' ')
  const managed = ` ${SEO_MANAGED_ATTR}="true"`
  if (tag.tag === 'script') {
    return `<script ${attrs}${managed}>${tag.content ?? ''}</script>`
  }
  if (tag.tag === 'link') {
    return `<link ${attrs}${managed} />`
  }
  return `<meta ${attrs}${managed} />`
}

export function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
