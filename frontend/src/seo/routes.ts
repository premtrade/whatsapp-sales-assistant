import type { SeoConfig } from './meta'
import { absoluteUrl, ORGANIZATION, SITE_ORIGIN, SOFTWARE_APPLICATION } from './meta'
import { BLOG_AUTHOR, type BlogPost, posts } from '@/content/blog'

export const LANDING_SEO: SeoConfig = {
  title: 'WAFLO',
  description:
    'WAFLO is a managed AI sales assistant for WhatsApp. It answers inbound messages, qualifies leads, sends quotes from your own price list, books appointments, and hands off to a person when needed.',
  path: '/',
  jsonLd: [ORGANIZATION, SOFTWARE_APPLICATION],
}

export const BLOG_INDEX_SEO: SeoConfig = {
  title: 'Blog',
  description:
    'Practical guides for business owners using WhatsApp to sell: setup, agent knowledge, lead handling, and honest guidance on whether WAFLO fits your business.',
  path: '/blog',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'WAFLO guides for WhatsApp sales teams',
      description:
        'Product setup, workflow basics, and guidance for deciding whether WAFLO fits the way your business handles enquiries.',
      url: `${SITE_ORIGIN}/blog`,
      publisher: { '@id': `${SITE_ORIGIN}/#organization` },
      blogPost: posts.map((post) => ({
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.summary,
        datePublished: post.publishedTime,
        url: absoluteUrl(`/blog/${post.slug}`),
      })),
    },
  ],
}

export function blogPostSeo(post: BlogPost): SeoConfig {
  const url = absoluteUrl(`/blog/${post.slug}`)
  return {
    title: post.title,
    description: post.summary,
    path: `/blog/${post.slug}`,
    type: 'article',
    publishedTime: post.publishedTime,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.summary,
        datePublished: post.publishedTime,
        dateModified: post.publishedTime,
        author: { '@type': 'Organization', name: BLOG_AUTHOR },
        publisher: { '@id': `${SITE_ORIGIN}/#organization` },
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        image: absoluteUrl('/og.png'),
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_ORIGIN}/blog` },
          { '@type': 'ListItem', position: 3, name: post.title, item: url },
        ],
      },
    ],
  }
}

export const FAQ_ITEMS: { question: string; answer: string; category: string }[] = [
  {
    category: 'Getting started',
    question: 'How do I connect my WhatsApp number?',
    answer: 'Go to Settings → WhatsApp in your dashboard, click Connect / Show QR Code, then open WhatsApp on your phone → Linked Devices → Link a Device and scan the QR code. No SSH is required.',
  },
  {
    category: 'Getting started',
    question: 'How long does setup take?',
    answer: 'Setup has three parts: create the account, pair your WhatsApp number by scanning a QR code, and load your services, price list, and FAQs into the knowledge base. The first two take a few minutes. The third is the part that determines how good the answers are, and it is worth doing properly — if you would rather have us build the knowledge base and configure the agent with you, we will do that as part of a managed setup.',
  },
  {
    category: 'Getting started',
    question: 'Can I use my existing WhatsApp Business number?',
    answer: 'Yes, as long as you can scan the QR code from that phone during setup. Use a number you can dedicate to the business, and keep that phone available so the linked session does not drop.',
  },
  {
    category: 'Billing',
    question: 'What happens after my 14-day trial ends?',
    answer: 'Your trial enters a 3-day grace period with full access. After that, requests return a 402 until you upgrade. You can upgrade anytime from the Billing page.',
  },
  {
    category: 'Billing',
    question: 'Can I change plans or cancel later?',
    answer: 'Yes. Use the Billing page to change plans or cancel at any time. You are not committed to a long-term contract.',
  },
  {
    category: 'Billing',
    question: 'What counts as an AI response, and do I pay WhatsApp fees on top?',
    answer: 'One AI response is one reply the assistant sends to a customer. Each plan includes a set number of these per month, and the limit is shown on the pricing table. WhatsApp conversation charges from Meta are separate from our subscription and are passed through at cost, so your total depends on how many conversations your business actually has. If you are unsure, ask us and we will model the cost for your message volume before you commit.',
  },
  {
    category: 'AI & responses',
    question: 'Does the AI invent prices or quotes?',
    answer: 'No. The AI is instructed to answer only from your uploaded knowledge base, and prices are looked up from your own product list rather than supplied by the model. If the answer is not in the knowledge base, it will say so and offer to connect you with a human.',
  },
  {
    category: 'AI & responses',
    question: 'How accurate is the AI?',
    answer: 'Accuracy depends on your knowledge base. Upload current price lists, service guides, and FAQs for best results. You can review every AI reply in the inbox before it matters, and take over a conversation at any point.',
  },
  {
    category: 'AI & responses',
    question: 'Will the customer know they are talking to an AI?',
    answer: 'Yes, and we think that is the right behaviour. WAFLO is configured to make the AI nature of the assistant clear in the first reply. An owner whose customers think they are talking to a person when they are not is exposed to a bad experience and to complaints when the limitation shows.',
  },
  {
    category: 'Data & privacy',
    question: 'Where is my data stored?',
    answer: 'Your data is stored on secure servers. Conversations, contacts, and documents are scoped to your business and not shared with other tenants. The Privacy Policy lists every processor we use and what each one receives.',
  },
  {
    category: 'Data & privacy',
    question: 'Which third parties process my business data?',
    answer: 'Your content is processed by the infrastructure that makes replies and retrieval work: our application server and database, our AI model provider for generating replies, our embedding provider for indexing your knowledge base, and WhatsApp itself for delivery. If you connect a CRM, that system is added to the list. See the Privacy Policy for the current list and how to request deletion.',
  },
  {
    category: 'Data & privacy',
    question: 'Can I export my data?',
    answer: 'Yes. Contact support and we will help you export your conversations, contacts, and quotes.',
  },
  {
    category: 'Product',
    question: 'What if I want to run this on my own servers?',
    answer: 'WAFLO is a managed service. We run the application, the WhatsApp connection, the AI pipeline, and the updates, and you use it from your browser. Self-hosting is not offered today.',
  },
]

export const FAQ_SEO: SeoConfig = {
  title: 'FAQ',
  description:
    'Answers about setting up WAFLO, WhatsApp connection, billing, AI accuracy, and how business data is handled.',
  path: '/faq',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ_ITEMS.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    },
  ],
}

export const PRIVACY_SEO: SeoConfig = {
  title: 'Privacy Policy',
  description:
    'How WAFLO collects, processes, and stores business and customer data, which third-party processors are involved, and how to request deletion.',
  path: '/privacy',
}

export const TERMS_SEO: SeoConfig = {
  title: 'Terms of Service',
  description:
    'The terms that govern use of WAFLO, including subscription, acceptable use, data ownership, and service commitments.',
  path: '/terms',
}
