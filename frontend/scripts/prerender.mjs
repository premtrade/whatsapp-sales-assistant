import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const dist = join(root, 'dist')
const ssrDir = join(root, 'dist-ssr')

const SITE_ORIGIN = 'https://waflo.vercel.app'

const ROUTES = [
  { path: '/', file: 'index.html' },
  { path: '/blog', file: 'blog/index.html' },
  { path: '/faq', file: 'faq/index.html' },
  { path: '/demo', file: 'demo/index.html' },
  { path: '/privacy', file: 'privacy/index.html' },
  { path: '/terms', file: 'terms/index.html' },
]

function log(message) {
  process.stdout.write(`[prerender] ${message}\n`)
}

async function loadSsrModule() {
  const entry = join(ssrDir, 'entry-prerender.js')
  return import(pathToFileURL(entry).href)
}

async function fetchPlans() {
  const base =
    process.env.PRERENDER_API_URL ||
    process.env.VITE_API_BASE_URL ||
    'https://waflo.vercel.app/api'
  const url = `${base.replace(/\/$/, '')}/billing/plans`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!response.ok) {
      log(`plans fetch failed (${response.status}); pricing will render as loading state`)
      return null
    }
    const body = await response.json()
    const plans = body?.data
    if (!Array.isArray(plans) || plans.length === 0) {
      log('plans fetch returned no data; pricing will render as loading state')
      return null
    }
    return plans
  } catch (error) {
    log(`plans fetch failed (${error?.message || error}); continuing without it`)
    return null
  }
}

function serializeForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildSitemap(pages) {
  const urls = pages
    .map((page) => {
      const loc = `${SITE_ORIGIN}${page.path === '/' ? '/' : page.path}`
      const lastmod = page.lastmod ? `<lastmod>${page.lastmod}</lastmod>` : ''
      return `  <url><loc>${loc}</loc>${lastmod}<changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

async function writeFileAt(relativePath, contents) {
  const target = join(dist, relativePath)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, contents, 'utf8')
}

function applyHead(template, { title, tags }) {
  let head = template.replace(/<title>[\s\S]*?<\/title>/, '')
  head = head.replace(/<meta name="description"[^>]*>/, '')
  const rendered = [
    `<title>${escapeHtml(title)}</title>`,
    ...tags.map((tag) => {
      const attrs = Object.entries(tag.attrs)
        .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
        .join(' ')
      if (tag.tag === 'script') {
        return `<script ${attrs} data-waflo-seo="true">${tag.content ?? ''}</script>`
      }
      if (tag.tag === 'link') {
        return `<link ${attrs} data-waflo-seo="true" />`
      }
      return `<meta ${attrs} data-waflo-seo="true" />`
    }),
  ].join('\n    ')
  return head.replace('</head>', `    ${rendered}\n  </head>`)
}

function applyBody(template, html, plans) {
  const plansScript = plans
    ? `<script>window.__WAFLO_PLANS__ = ${serializeForScript(plans)};</script>`
    : ''
  return template.replace(
    /<div id="root"><\/div>/,
    `<div id="root">${html}</div>\n    ${plansScript}`
  )
}

async function main() {
  const template = await readFile(join(dist, 'index.html'), 'utf8')

  // The shell used for every non-marketing route (dashboard, login, signup,
  // ...). It must stay empty so authenticated views never flash the landing
  // page before React takes over.
  const appShell = applyHead(template, {
    title: 'WAFLO',
    tags: [
      {
        tag: 'meta',
        attrs: { name: 'robots', content: 'noindex, nofollow' },
      },
    ],
  })
  await writeFileAt('app.html', appShell)
  log('wrote app.html (empty shell for authenticated routes)')

  const ssr = await loadSsrModule()
  const plans = await fetchPlans()
  if (plans) {
    ssr.setStaticPlans(plans)
    log(`loaded ${plans.length} plan(s) for static pricing`)
  }

  const pages = ssr.renderAll()
  const sitemapEntries = []

  for (const page of pages) {
    const html = applyHead(template, { title: page.title, tags: page.tags })
    const withBody = applyBody(html, page.html, page.path === '/' ? plans : null)
    await writeFileAt(page.outFile, withBody)
    log(`prerendered ${page.path} -> dist/${page.outFile}`)

    const route = ROUTES.find((r) => r.path === page.path)
    sitemapEntries.push({
      path: page.path,
      changefreq: route ? 'weekly' : 'monthly',
      priority: page.path === '/' ? '1.0' : page.path === '/blog' ? '0.7' : '0.6',
      lastmod: page.path.startsWith('/blog/') ? undefined : undefined,
    })
  }

  // Blog posts are listed explicitly so the sitemap stays in step with the
  // content module rather than with the prerender output.
  for (const post of ssr.posts || []) {
    const entry = sitemapEntries.find((item) => item.path === `/blog/${post.slug}`)
    if (entry) {
      entry.lastmod = post.publishedTime.slice(0, 10)
      entry.changefreq = 'monthly'
    }
  }

  await writeFileAt('sitemap.xml', buildSitemap(sitemapEntries))
  log('wrote dist/sitemap.xml')

  await writeFileAt(
    'robots.txt',
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /dashboard',
      'Disallow: /inbox',
      'Disallow: /customers',
      'Disallow: /leads',
      'Disallow: /lead-pipeline',
      'Disallow: /quotes',
      'Disallow: /appointments',
      'Disallow: /knowledge',
      'Disallow: /handoffs',
      'Disallow: /ai-activity',
      'Disallow: /analytics',
      'Disallow: /settings',
      'Disallow: /plans',
      'Disallow: /owner',
      'Disallow: /billing',
      'Disallow: /audit-logs',
      'Disallow: /setup',
      'Disallow: /accept-invite',
      '',
      `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
      '',
    ].join('\n')
  )
  log('wrote dist/robots.txt')
}

main().catch((error) => {
  process.stderr.write(`[prerender] failed: ${error?.stack || error}\n`)
  process.exit(1)
})
