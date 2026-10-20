import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(p, 'utf8')

const idx = read('dist/index.html')
const title = idx.match(/<title>(.*?)<\/title>/)[1]
console.log('title:', title, '| em dash intact:', title.includes('\u2014'))
console.log('root div filled with content:', /<div id="root">.{500,}/s.test(idx))
console.log('plans script present:', idx.includes('__WAFLO_PLANS__'))
const plansMatch = idx.match(/__WAFLO_PLANS__ = (\[.*?\]);<\/script>/s)
console.log('plans payload length:', plansMatch ? plansMatch[1].length : 'MISSING')
console.log('pricing rendered statically:', idx.includes('Most Popular') && idx.includes('/month'))
console.log('guarantees section present:', idx.includes('What the Assistant Will Never Do'))
console.log('no MIT claim:', !idx.includes('MIT License'))
console.log('no fabricated testimonials:', !idx.includes('Carlos M.') && !idx.includes('Sarah K.') && !idx.includes('James T.'))
console.log('no money-back guarantee:', !idx.includes('money-back'))
console.log('no "20 minutes" claim:', !idx.includes('20 minutes'))
console.log('no "self-host" claim:', !idx.includes('self-host') && !idx.includes('Self-hostable') && !idx.includes('Open source core'))
console.log('no Qdrant in stack:', !idx.includes('Qdrant'))
console.log('ROLINJ.IO named:', idx.includes('ROLINJ.IO'))
console.log('privacy/terms links:', idx.includes('/privacy') && idx.includes('/terms'))

console.log('--- app.html (shell for authenticated routes) ---')
const app = read('dist/app.html')
console.log('exists and is small:', app.length < 4096)
console.log('root empty (no landing flash on authed routes):', /<div id="root"><\/div>/.test(app))
console.log('noindex present:', app.includes('noindex'))
console.log('no landing content:', !app.includes('Most Popular'))

console.log('--- blog post ---')
const post = read('dist/blog/setup-whatsapp/index.html')
console.log('post heading present:', post.includes('Set up WAFLO and connect WhatsApp without SSH'))
console.log('post body present:', post.includes('Open the signup page'))
const canonical = post.match(/rel="canonical" href="([^"]+)/)
console.log('canonical:', canonical ? canonical[1] : 'MISSING')
console.log('BlogPosting JSON-LD:', post.includes('"@type":"BlogPosting"'))

console.log('--- faq ---')
const faq = read('dist/faq/index.html')
console.log('FAQPage JSON-LD:', faq.includes('"@type":"FAQPage"'))
console.log('self-host answer honest:', faq.includes('WAFLO is a managed service'))

console.log('--- sitemap ---')
console.log(read('dist/sitemap.xml'))
