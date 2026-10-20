import { renderToString } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'

import LandingPage from './pages/LandingPage'
import BlogPage from './pages/Blog'
import BlogPostPage from './pages/BlogPost'
import FAQPage from './pages/FAQ'
import PrivacyPage from './pages/Privacy'
import TermsPage from './pages/Terms'

import { posts } from './content/blog'
import { buildMetaTags, type MetaTag, type SeoConfig } from './seo/meta'
import {
  BLOG_INDEX_SEO,
  FAQ_SEO,
  LANDING_SEO,
  PRIVACY_SEO,
  TERMS_SEO,
  blogPostSeo,
} from './seo/routes'
import { setStaticPlans } from './seo/staticPlans'
import type { Plan } from './types'

export type PrerenderRoute = {
  path: string
  outFile: string
  seo: SeoConfig
  element: ReactElement
}

export function getRoutes(): PrerenderRoute[] {
  const routes: PrerenderRoute[] = [
    { path: '/', outFile: 'index.html', seo: LANDING_SEO, element: <LandingPage /> },
    { path: '/blog', outFile: 'blog/index.html', seo: BLOG_INDEX_SEO, element: <BlogPage /> },
    { path: '/faq', outFile: 'faq/index.html', seo: FAQ_SEO, element: <FAQPage /> },
    { path: '/privacy', outFile: 'privacy/index.html', seo: PRIVACY_SEO, element: <PrivacyPage /> },
    { path: '/terms', outFile: 'terms/index.html', seo: TERMS_SEO, element: <TermsPage /> },
  ]

  for (const post of posts) {
    routes.push({
      path: `/blog/${post.slug}`,
      outFile: `blog/${post.slug}/index.html`,
      seo: blogPostSeo(post),
      element: (
        <Routes>
          <Route path="/blog/:slug" element={<BlogPostPage />} />
        </Routes>
      ),
    })
  }

  return routes
}

export type PrerenderedPage = {
  path: string
  outFile: string
  title: string
  tags: MetaTag[]
  html: string
}

export function renderAll(): PrerenderedPage[] {
  return getRoutes().map((route) => {
    const html = withSuppressedSsrWarnings(() =>
      renderToString(<MemoryRouter initialEntries={[route.path]}>{route.element}</MemoryRouter>)
    )
    const { title, tags } = buildMetaTags(route.seo)
    return { path: route.path, outFile: route.outFile, title, tags, html }
  })
}

/**
 * react-router's Router subscribes to history in a layout effect, which React
 * cannot run on the server. The subscription does not affect rendered markup,
 * so the warning is noise in the build log rather than a real problem.
 */
const SUPPRESSED = 'useLayoutEffect does nothing on the server'

function withSuppressedSsrWarnings<T>(fn: () => T): T {
  const original = console.error
  console.error = (...args: unknown[]) => {
    const first = args.find((arg) => typeof arg === 'string')
    if (typeof first === 'string' && first.includes(SUPPRESSED)) return
    original(...(args as []))
  }
  try {
    return fn()
  } finally {
    console.error = original
  }
}

export { setStaticPlans, type Plan, posts }
