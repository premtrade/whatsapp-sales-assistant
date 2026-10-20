import { Link, useParams } from 'react-router-dom'
import MarketingLayout from '@/components/MarketingLayout'
import Seo from '@/components/Seo'
import { getPost, posts, BLOG_AUTHOR } from '@/content/blog'
import { blogPostSeo } from '@/seo/routes'

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>()
  const post = slug ? getPost(slug) : undefined

  if (!post) {
    return (
      <MarketingLayout>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-24 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-surface-950">Article not found</h1>
          <p className="mt-4 text-surface-600">
            That article does not exist or has been moved.
          </p>
          <Link to="/blog" className="btn-primary mt-8 inline-flex">
            Back to the blog
          </Link>
        </div>
      </MarketingLayout>
    )
  }

  return (
    <MarketingLayout>
      <Seo config={blogPostSeo(post)} />

      <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
        <nav aria-label="Breadcrumb" className="text-sm text-surface-500">
          <Link to="/" className="hover:text-surface-700">Home</Link>
          <span className="mx-2">/</span>
          <Link to="/blog" className="hover:text-surface-700">Blog</Link>
          <span className="mx-2">/</span>
          <span className="text-surface-700">{post.title}</span>
        </nav>

        <p className="mt-8 text-xs font-semibold uppercase tracking-wide text-primary-700">{post.category}</p>
        <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-surface-950">{post.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-surface-600">{post.summary}</p>
        <p className="mt-4 text-sm text-surface-500">
          Published{' '}
          <time dateTime={post.publishedTime}>
            {new Date(post.publishedTime).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </time>{' '}
          · {BLOG_AUTHOR}
        </p>

        <div className="mt-10 space-y-8">
          {post.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold text-surface-900">{section.heading}</h2>
              <div className="mt-3 space-y-3 text-base leading-7 text-surface-700">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              {section.example && (
                <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-lg border border-surface-200 bg-surface-50 p-4 text-xs leading-6 text-surface-700">
                  {section.example}
                </pre>
              )}
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-surface-200 bg-surface-50 p-6">
          <h2 className="text-lg font-semibold text-surface-900">Try it on your own WhatsApp number</h2>
          <p className="mt-2 text-sm text-surface-600">
            Start a 14-day trial, pair your business number from the dashboard, and upload your services and
            price list. No credit card required.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <Link to="/signup" className="btn-primary">Start Free Trial</Link>
            <Link to="/blog" className="btn-secondary">More guides</Link>
          </div>
        </div>

        <section className="mt-12 border-t border-surface-200 pt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-surface-500">More guides</h2>
          <ul className="mt-4 space-y-3">
            {posts
              .filter((p) => p.slug !== post.slug)
              .map((p) => (
                <li key={p.slug}>
                  <Link to={`/blog/${p.slug}`} className="text-base font-medium text-surface-900 hover:text-primary-700">
                    {p.title}
                  </Link>
                  <p className="text-sm text-surface-600">{p.summary}</p>
                </li>
              ))}
          </ul>
        </section>
      </article>
    </MarketingLayout>
  )
}
