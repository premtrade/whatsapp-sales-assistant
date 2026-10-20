import { Link } from 'react-router-dom'
import MarketingLayout from '@/components/MarketingLayout'
import Seo from '@/components/Seo'
import { posts } from '@/content/blog'
import { BLOG_INDEX_SEO } from '@/seo/routes'

export default function BlogPage() {
  return (
    <MarketingLayout>
      <Seo config={BLOG_INDEX_SEO} />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">WAFLO Blog</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-surface-950">
            Guides for WhatsApp sales teams
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-surface-600">
            Product setup, workflow basics, and guidance for deciding whether WAFLO fits the way your business
            handles enquiries.
          </p>
        </div>

        <div className="mt-12 grid gap-8 border-t border-surface-200 pt-8 sm:grid-cols-2">
          {posts.map((post) => (
            <article key={post.slug} className="flex flex-col">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">{post.category}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-surface-950">
                <Link to={`/blog/${post.slug}`} className="hover:text-primary-700">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-surface-600">{post.summary}</p>
              <p className="mt-4 text-sm">
                <Link to={`/blog/${post.slug}`} className="font-medium text-primary-700 hover:underline">
                  Read the guide
                </Link>
              </p>
            </article>
          ))}
        </div>
      </div>
    </MarketingLayout>
  )
}
