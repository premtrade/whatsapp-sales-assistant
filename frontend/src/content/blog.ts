export type BlogSection = {
  heading: string
  paragraphs: string[]
  example?: string
}

export type BlogPost = {
  slug: string
  category: string
  title: string
  summary: string
  publishedTime: string
  author: string
  sections: BlogSection[]
}

export const BLOG_AUTHOR = 'ROLINJ.IO'

export const posts: BlogPost[] = [
  {
    slug: 'setup-whatsapp',
    category: 'Getting started',
    title: 'Set up WAFLO and connect WhatsApp without SSH',
    summary:
      'Create your business account, pair its dedicated WhatsApp number from the dashboard, and send a test message before you rely on the workflow.',
    publishedTime: '2026-08-24T09:00:00.000Z',
    author: BLOG_AUTHOR,
    sections: [
      {
        heading: '1. Create the business account',
        paragraphs: [
          'Open the signup page and enter your business name, a unique slug, WhatsApp number, owner name, email, and password. Enter the number in international format, such as +18765551234. Choose a slug that is at least 3 characters and not already in use.',
          'Use a password with at least 8 characters, one uppercase letter, and one number. Signup creates the business and owner-admin account and provisions a Starter trial for dashboard use.',
          'Use a phone number you can keep dedicated to the business WhatsApp connection. The phone must be available to scan the device-pairing QR code.',
        ],
      },
      {
        heading: '2. Pair the WhatsApp device',
        paragraphs: [
          'After account creation, leave the signup setup screen open. In another browser tab, sign in with the owner email and password, then open Settings → WhatsApp.',
          'Choose Connect / Show QR Code. On the phone that owns the business number, open WhatsApp → Linked Devices → Link a Device and scan the QR code shown in the dashboard. This in-dashboard pairing flow does not require SSH access.',
          'Wait until the dashboard reports that WhatsApp is connected. Keep the phone and number available for the business connection.',
        ],
      },
      {
        heading: '3. Activate and run a test',
        paragraphs: [
          'Return to the original signup tab and select “I’ve connected WhatsApp” to finish activation. Continue to the dashboard.',
          'Add business information in Settings, upload useful source material in Knowledge Base, and add staff members in Settings → Staff if teammates need access.',
          'Send a test message to the connected WhatsApp number from a different phone. Confirm that the incoming message appears in Inbox and that the configured n8n message-to-reply workflow responds as expected.',
        ],
      },
    ],
  },
  {
    slug: 'what-waflo-does',
    category: 'Product guide',
    title: 'What WAFLO does with a WhatsApp enquiry',
    summary:
      'WAFLO connects customer conversations to an AI response workflow and gives the business a shared place to review sales activity.',
    publishedTime: '2026-08-26T09:00:00.000Z',
    author: BLOG_AUTHOR,
    sections: [
      {
        heading: 'From message to business context',
        paragraphs: [
          'A customer sends a message to the connected business WhatsApp number. The message enters an n8n workflow, where the assistant can use the business knowledge and conversation context configured for that account to prepare a reply.',
          'The full inbound WhatsApp message-to-reply path has been exercised. What the assistant can do beyond replying depends on which workflows, tools, and business information are configured for the account.',
        ],
      },
      {
        heading: 'A workspace for the team',
        paragraphs: [
          'The dashboard brings conversations and customer context together with operational views for leads, quotes, appointments, and handoffs. Staff can review conversations and take over when a request needs a person.',
          'Depending on the configured workflow, the assistant can help qualify enquiries, prepare quotes, support appointment booking, and route conversations for human follow-up. Businesses should test those actions with their own process before relying on them.',
        ],
      },
      {
        heading: 'Keep a person in the loop',
        paragraphs: [
          'An automated response is not a guarantee that every request is understood or resolved. Decide which questions are suitable for automation, what requires approval, and how staff should handle uncertain or sensitive cases.',
        ],
      },
    ],
  },
  {
    slug: 'who-waflo-fits',
    category: 'Choosing a workflow',
    title: 'Is WAFLO a fit for your business?',
    summary:
      'WAFLO is designed for teams that already handle customer enquiries in WhatsApp and want a more organized path from first message to follow-up.',
    publishedTime: '2026-08-28T09:00:00.000Z',
    author: BLOG_AUTHOR,
    sections: [
      {
        heading: 'A good fit',
        paragraphs: [
          'WAFLO is best suited to WhatsApp-heavy sales and service businesses that receive repeat questions, qualify potential customers, prepare quotes, or arrange appointments. Contractors, construction companies, and other quote- or appointment-driven service teams are natural groups to evaluate.',
          'It is especially useful when the business can provide current information about its services and has staff available to review unusual requests or take over a conversation.',
        ],
      },
      {
        heading: 'Probably not the right tool',
        paragraphs: [
          'If your customers do not contact you through WhatsApp, WAFLO may not address a meaningful problem. It is also not positioned as a general-purpose CRM for businesses looking mainly for broad contact management without an AI messaging workflow.',
        ],
      },
      {
        heading: 'Test the fit with real enquiries',
        paragraphs: [
          'Start with common, low-risk customer questions. Check the quality of replies, confirm when the workflow hands a conversation to staff, and make sure the dashboard fits how your team works. Use a dedicated business number and keep a human responsible for reviewing conversations during evaluation.',
        ],
      },
    ],
  },
  {
    slug: 'business-knowledge',
    category: 'Agent setup',
    title: 'Give Your Agent Your Business Knowledge',
    summary:
      'Give an AI assistant clear, current facts about your business, then spell out how it should use them when replying to customers.',
    publishedTime: '2026-09-01T09:00:00.000Z',
    author: BLOG_AUTHOR,
    sections: [
      {
        heading: 'A useful answer starts with useful context',
        paragraphs: [
          'An AI assistant can only represent your business well when it has reliable information to work from. A vague instruction such as “answer questions about our services” leaves important gaps: which services do you offer, where do you work, what do things cost, and when should a person step in?',
          'Create one concise, maintained source of truth. Use plain language, clear headings, and specific details. If information changes often, assign someone to review it regularly and remove old versions so the assistant is not choosing between conflicting facts.',
        ],
      },
      {
        heading: 'What to include in your business knowledge',
        paragraphs: [
          'Business details: your name, a short description, contact information, service area, and the locations you do not cover.',
          'Services and pricing: what you offer, what is included, starting prices or price ranges, what affects the final quote, and what needs an inspection or staff approval. Label estimates clearly; never present a conditional price as guaranteed.',
          'Opening hours and location: normal business hours, holidays or closures, time zone, address, travel area, and expected response times outside working hours.',
          'Policies and FAQs: payment methods, deposits, cancellations, warranties, preparation requirements, and concise answers to common customer questions.',
          'Brand voice and booking rules: whether you sound formal or conversational, what details are needed to request an appointment, which times can be offered, and how to handle requests that need confirmation.',
        ],
      },
      {
        heading: 'Give the assistant operating rules too',
        paragraphs: [
          'Facts describe your business; instructions describe how the assistant should behave. Tell it to use the supplied information, ask a short clarifying question when a detail is missing, and say when it does not know. It should not invent prices, availability, policies, or promises.',
          'Define when to stop and hand off: for example, a customer asks for a person, the request is a complaint, a quote needs approval, or the answer is not covered by the business material. Ask the assistant to summarize what the team needs to know when handing over.',
        ],
      },
      {
        heading: 'A starter instruction you can adapt',
        paragraphs: [
          'Use this as a starting point for an agent instruction. Replace every bracketed field with confirmed information and remove any rule that does not fit your business:',
        ],
        example: `You are the WhatsApp assistant for [BUSINESS NAME].\n\nUse the business information and conversation context provided to answer customer questions. Be [BRAND VOICE] and keep replies clear and concise.\n\nServices: [SERVICES]\nService area: [LOCATIONS]\nHours: [OPENING HOURS AND TIME ZONE]\nPricing: [CONFIRMED PRICES OR HOW TO REQUEST A QUOTE]\nBooking rules: [REQUIRED DETAILS, AVAILABLE TIMES, AND CONFIRMATION PROCESS]\nPolicies and FAQs: [IMPORTANT POLICIES AND COMMON ANSWERS]\n\nNever invent a price, appointment, policy, service, or commitment. If information is missing or uncertain, ask a focused question or say that a team member will confirm it. Hand off complaints, requests for a person, and decisions requiring approval. Before handing off, summarize the customer's request and any details already collected.`,
      },
      {
        heading: 'Adding this knowledge to WAFLO',
        paragraphs: [
          'In WAFLO, add business source material through the dashboard’s Knowledge Base. Upload a current services guide, FAQ, price list, or booking policy with a clear title. The agent’s conversational instructions are configured in the n8n workflow, so this article is not asking business owners to edit application source files or promising a system-prompt editor in the dashboard.',
          'After adding or updating material, test with realistic customer questions: one with a clear answer, one missing an important detail, and one that should be handed to a person. Check that the response uses the source correctly and does not make up the missing information.',
        ],
      },
    ],
  },
]

export function getPost(slug: string): BlogPost | undefined {
  return posts.find((post) => post.slug === slug)
}

export function listPostSlugs(): string[] {
  return posts.map((post) => post.slug)
}
