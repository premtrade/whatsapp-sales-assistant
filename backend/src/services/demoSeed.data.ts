/**
 * Demo tenant seed.
 *
 * Creates a fully populated, entirely fictional business so the marketing site
 * can show the product working with real data instead of a drawing. It is the
 * same tenant the public demo reads from, and the one a live WhatsApp demo
 * number is paired to.
 *
 * Everything here is invented. The phone numbers are placeholders, the names
 * are fictional, and nothing about a real customer is reproduced.
 */

import { query } from '../utils/database';
import logger from '../utils/logger';
import { createBusiness } from './business.service';
import { createTrial } from './subscription.service';
import { hashPassword } from './auth.service';
import { generateEmbeddingsBatch, formatEmbeddingForPgVector, EMBEDDING_MODEL } from './embedding';

export const DEMO_SLUG = 'waflo-demo';

/** The demo business, as it appears to a visitor. */
export const BUSINESS = {
  name: 'Harbour Point Roofing',
  slug: DEMO_SLUG,
  description:
    'Roofing, gutters and leak repairs across Kingston and St. Andrew. Family-run, 12 years in the trade.',
  email: 'hello@harbourpointroofing.demo',
  phone: '+18765550100',
  website: 'https://harbourpointroofing.demo',
  address: '18 Harbour View Road, Kingston 5, Jamaica',
  currency: 'JMD',
  timezone: 'America/Jamaica',
  /** Placeholder. Never paired to a real WhatsApp session unless an operator
   *  deliberately does so for the live demo. */
  whatsapp_phone: '+18765550100',
  waha_session_name: 'waha-waflo-demo',
};

export const PRODUCTS = [
  {
    sku: 'HPR-ROOF-2000',
    name: 'Roof Replacement — 2,000 sq ft shingle package',
    description:
      'Full replacement for a standard-pitch home up to 2,000 sq ft. Includes removal and disposal of the old roof, architectural shingles, underlayment, flashing, new ridge vent and a 10-year workmanship warranty.',
    category: 'Roofing',
    unit: 'project',
    price: 245000,
  },
  {
    sku: 'HPR-ROOF-3000',
    name: 'Roof Replacement — 3,000 sq ft shingle package',
    description:
      'As above for homes up to 3,000 sq ft. Adds upgraded underlayment, ice-and-water shield in the valleys and a 15-year workmanship warranty.',
    category: 'Roofing',
    unit: 'project',
    price: 342000,
  },
  {
    sku: 'HPR-REPAIR-SQFT',
    name: 'Roof Repair — per sq ft',
    description:
      'Repair of a leaking area, replacing damaged shingles, underlayment and flashing. Priced per square foot of affected area, minimum one square.',
    category: 'Repairs',
    unit: 'sq ft',
    price: 1850,
  },
  {
    sku: 'HPR-LEAK-EMERGENCY',
    name: 'Emergency Leak Repair — 24 hour response',
    description:
      'Emergency call-out to stop active water ingress. Temporary weatherproof patch and a same-day assessment with a fixed quote for the permanent repair.',
    category: 'Repairs',
    unit: 'visit',
    price: 35000,
  },
  {
    sku: 'HPR-GUTTER-REPLACE',
    name: 'Gutter Replacement — 5 inch seamless',
    description:
      'Replacement of continuous 5 inch aluminium gutters with new downpipes and brackets, fitted to the existing fascia.',
    category: 'Gutters',
    unit: 'project',
    price: 68000,
  },
  {
    sku: 'HPR-INSPECT',
    name: 'Roof Inspection and Written Report',
    description:
      'On-site inspection of the roof, attic and gutters with a written report, photographs and a prioritised repair list. Credited against a full replacement if you go ahead within 60 days.',
    category: 'Inspections',
    unit: 'inspection',
    price: 12000,
  },
  {
    sku: 'HPR-SOFFIT-FASCIA',
    name: 'Soffit and Fascia Replacement',
    description:
      'Replacement of rotting timber soffit and fascia with ventilated vinyl, including the drip edge along the gutter line.',
    category: 'Roofing',
    unit: 'project',
    price: 92000,
  },
];

export const CONTACTS = [
  {
    key: 'karen',
    phone: '+18765550201',
    display_name: 'Karen Mitchell',
    company: null,
    tags: ['roof-replacement', 'homeowner', 'st-andrew'],
    notes: 'Owns a 2,000 sq ft home in St. Andrew. Recommended by a neighbour.',
  },
  {
    key: 'devon',
    phone: '+18765550202',
    display_name: 'Devon Bailey',
    company: 'Bailey Hardware Supplies',
    tags: ['gutters', 'commercial', 'repeat'],
    notes: 'Commercial client. Gutters on the main warehouse building.',
  },
  {
    key: 'marcia',
    phone: '+18765550203',
    display_name: 'Marcia Grant',
    company: null,
    tags: ['urgent', 'leak'],
    notes: 'Active leak over the master bedroom after the weekend rain.',
  },
  {
    key: 'trevor',
    phone: '+18765550204',
    display_name: 'Trevor Spence',
    company: null,
    tags: ['inspection', 'evaluating'],
    notes: 'Comparing quotes. Asked for an inspection first, no commitment.',
  },
  {
    key: 'rohan',
    phone: '+18765550205',
    display_name: 'Rohan Clarke',
    company: null,
    tags: ['repair', 'residential'],
    notes: 'Small repair job, a few damaged shingles after the storm.',
  },
  {
    key: 'alison',
    phone: '+18765550206',
    display_name: 'Alison Beckford',
    company: null,
    tags: ['gutters', 'homeowner'],
    notes: 'Gutters overflowing at the front of the house.',
  },
];

/** The conversation the marketing site shows. Enquiry to booked site visit. */
export const KAREN_THREAD = [
  {
    direction: 'incoming',
    sender_type: 'customer',
    minutes_ago: 34,
    text: "Hi! I need a new roof for my 2,000 sq ft house in St. Andrew. Budget is around JMD 250,000. Can you send me a quote?",
  },
  {
    direction: 'outgoing',
    sender_type: 'ai',
    minutes_ago: 33,
    text: "Hi Karen — you're messaging Harbour Point Roofing, so let me be clear that you're talking to our AI assistant.\n\nA 2,000 sq ft roof replacement in St. Andrew falls under our standard shingle package at JMD 245,000. That covers removal and disposal of the old roof, architectural shingles, underlayment, flashing and a new ridge vent, with a 10-year workmanship warranty.\n\nI've sent the quote to you now. Would you like to book a site visit? I can do Tuesday or Thursday morning.",
  },
  {
    direction: 'outgoing',
    sender_type: 'ai',
    minutes_ago: 33,
    document: true,
    text: '📄 Quote HQ-2026-0148 — JMD 245,000, valid 30 days.',
  },
  {
    direction: 'incoming',
    sender_type: 'customer',
    minutes_ago: 21,
    text: 'Thanks, that works for me. Thursday morning please.',
  },
  {
    direction: 'outgoing',
    sender_type: 'ai',
    minutes_ago: 21,
    text: "Booked — Thursday at 9:00am. Your site visit confirmation and a reminder the day before are on the way. Karen can also reach me on this number any time if you want to change the slot.",
  },
];

export const OTHER_THREADS = {
  devon: [
    {
      direction: 'incoming',
      sender_type: 'customer',
      minutes_ago: 60 * 24 * 9,
      text: 'Morning. The gutters on the warehouse are overflowing again. Can you replace them?',
    },
    {
      direction: 'outgoing',
      sender_type: 'ai',
      minutes_ago: 60 * 24 * 9 - 1,
      text: "Good morning — you're messaging Harbour Point Roofing's AI assistant.\n\nReplacing 5 inch seamless gutters with new downpipes comes to JMD 68,000 for a building this size. I can send a quote over now, or book a site visit first if you'd like us to measure it. Which would you prefer?",
    },
    {
      direction: 'incoming',
      sender_type: 'customer',
      minutes_ago: 60 * 24 * 9 - 6,
      text: 'Book the visit please, we can measure on site.',
    },
  ],
  marcia: [
    {
      direction: 'incoming',
      sender_type: 'customer',
      minutes_ago: 60 * 24 * 5,
      text: 'Water is coming in over the master bedroom roof since Saturday. How soon can someone come?',
    },
    {
      direction: 'outgoing',
      sender_type: 'ai',
      minutes_ago: 60 * 24 * 5 - 1,
      text: "Sorry to hear that — you're messaging Harbour Point Roofing's AI assistant.\n\nWe have a 24 hour emergency call-out for active leaks at JMD 35,000, which covers a same-day assessment and a permanent repair quote. I can get someone out to you today. Does that work?",
    },
  ],
  trevor: [
    {
      direction: 'incoming',
      sender_type: 'customer',
      minutes_ago: 60 * 24 * 3,
      text: 'Do you charge for an inspection? I am not ready to commit to a full roof yet.',
    },
    {
      direction: 'outgoing',
      sender_type: 'ai',
      minutes_ago: 60 * 24 * 3 - 1,
      text: "No pressure at all — you're messaging Harbour Point Roofing's AI assistant.\n\nA roof inspection and written report is JMD 12,000, and that is credited in full against a replacement if you go ahead within 60 days. I can book one for you this week if you would like.",
    },
  ],
  rohan: [
    {
      direction: 'incoming',
      sender_type: 'customer',
      minutes_ago: 60 * 24 * 7,
      text: 'A few shingles came off in the storm. Is that a repair or a replacement?',
    },
    {
      direction: 'outgoing',
      sender_type: 'ai',
      minutes_ago: 60 * 24 * 7 - 1,
      text: "You're messaging Harbour Point Roofing's AI assistant.\n\nIf it is only a few shingles, that is a repair at JMD 1,850 per square foot, with a one square minimum. If the deck underneath is soft, we will tell you on the site visit and quote the full replacement then. Either way a JMD 12,000 inspection tells us which it is before you commit.",
    },
  ],
  alison: [
    {
      direction: 'incoming',
      sender_type: 'customer',
      minutes_ago: 60 * 24 * 1,
      text: 'The gutters at the front of the house keep overflowing when it rains hard.',
    },
    {
      direction: 'outgoing',
      sender_type: 'ai',
      minutes_ago: 60 * 24 * 1 - 1,
      text: "You're messaging Harbour Point Roofing's AI assistant.\n\nReplacing 5 inch seamless gutters with new downpipes and brackets is JMD 68,000, fitted to the existing fascia. I can send the quote over, or book a site visit first so we can measure. Which would you prefer?",
    },
  ],
};

export const KNOWLEDGE_DOCUMENTS = [
  {
    title: 'Services and Price List',
    document_type: 'policy' as const,
    text: `Harbour Point Roofing — Services and Price List

We are a family-run roofing contractor working across Kingston, St. Andrew and Portmore. We have been in the trade for 12 years and carry a 10-year workmanship warranty on full replacements.

ROOF REPLACEMENT
A 2,000 sq ft shingle package is JMD 245,000. This includes removal and disposal of the old roof, architectural shingles, underlayment, flashing, a new ridge vent and a 10-year workmanship warranty.
A 3,000 sq ft shingle package is JMD 342,000. This adds upgraded underlayment, ice-and-water shield in the valleys and a 15-year workmanship warranty.
Prices assume a standard pitch with no deck repairs and easy roof access. If the deck needs replacing, that is quoted separately after the site visit.

ROOF REPAIRS
Repairs are priced at JMD 1,850 per square foot of affected area, with a minimum of one square. This covers replacing damaged shingles, underlayment and flashing.
Emergency leak call-out is JMD 35,000 with a 24 hour response. That covers a same-day assessment, a temporary weatherproof patch and a fixed quote for the permanent repair.

GUTTERS
Replacing 5 inch seamless aluminium gutters with new downpipes and brackets is JMD 68,000, fitted to the existing fascia.

SOFFIT AND FASCIA
Replacement of rotting timber soffit and fascia with ventilated vinyl, including the drip edge along the gutter line, is JMD 92,000.

INSPECTIONS
A roof inspection with a written report, photographs and a prioritised repair list is JMD 12,000. It is credited in full against a replacement if you go ahead within 60 days.

WHAT IS NOT INCLUDED
Deck repairs, re-roofing over an existing roof, painting, gutter guards, skylights and structural work are not included in the prices above and are quoted separately.

PAYMENT
We accept bank transfer and cash. A 50% deposit is required to book a date, with the balance due on completion. Quotes are valid for 30 days.`,
  },
  {
    title: 'Service Area and Availability',
    document_type: 'policy' as const,
    text: `Harbour Point Roofing — Service Area and Availability

WHERE WE WORK
We work in Kingston, St. Andrew, Portmore, Spanish Town and the surrounding areas. We do not currently travel to Montego Bay or the western parishes.

SERVICE AREAS
Kingston — Kingston 1 to Kingston 8
St. Andrew — Constant Spring, Stony Hill, Gordon Heights, New Harbour, Harbour View, Ferry Gardens
Portmore — all areas
Spanish Town — all areas

HOW LONG A JOB TAKES
A full 2,000 sq ft roof replacement takes two to three days on site once the deck is confirmed sound.
Gutter replacement is normally a single day.
A 3,000 sq ft replacement takes three to four days.
Emergency leak call-outs are attended within 24 hours, usually the same day.

BOOKING A SITE VISIT
Site visits are available Monday to Friday, 8:00am to 4:00pm, and Saturday mornings by arrangement. We do not visit on Sundays.
A site visit takes around 45 minutes. There is no charge for the visit itself, and it is needed before we can confirm a final price where the roof is not straightforward.

WEATHER
Work is scheduled in dry weather. If rain is forecast we will call you the evening before and move the date rather than risk the roof being open overnight.`,
  },
  {
    title: 'Frequently Asked Questions',
    document_type: 'faq' as const,
    text: `Harbour Point Roofing — Frequently Asked Questions

How long does a roof replacement take?
A 2,000 sq ft replacement takes two to three days on site. A 3,000 sq ft replacement takes three to four days. We book a start date once the deposit is paid and the site visit has confirmed the deck is sound.

Do you offer a free quote?
We do not do free quotes without seeing the roof. The site visit is free and takes about 45 minutes, and the written quote follows within 24 hours. If you decide to go ahead with a full replacement within 60 days, the JMD 12,000 inspection fee is credited in full.

How do I pay?
Bank transfer or cash. A 50% deposit is required to book a start date, and the balance is due on completion. We email a quote with the full breakdown and a reference number.

What happens if it rains during the job?
We schedule in dry weather and cover the deck with tarpaulin if a shower comes through. If we have to stop for a full day of rain, we resume as soon as the weather clears and you are not charged for the day.

Do you remove the old roof?
Yes, removal and disposal of the old roof is included in every replacement package. We take the debris away ourselves.

Do you do repairs as well as replacements?
Yes. Repairs are JMD 1,850 per square foot of affected area with a minimum of one square, and we have a 24 hour emergency call-out for active leaks.

Do you fix gutters too?
Yes. Replacing 5 inch seamless aluminium gutters with new downpipes and brackets is JMD 68,000.

Are you insured?
Yes, we carry public liability and workers' compensation cover, and we can provide the certificate on request.

What areas do you cover?
Kingston, St. Andrew, Portmore and Spanish Town. We do not currently travel to Montego Bay or the western parishes.

How do I know if I need a new roof or a repair?
Book the JMD 12,000 inspection. We will look at the roof, the attic and the gutters, and give you a written report with photographs and a prioritised repair list, so you can decide with the facts in front of you.`,
  },
];

export const AI_PROMPT = `You are the WhatsApp assistant for Harbour Point Roofing, a family-run roofing contractor in Kingston, Jamaica.

Answer using only the business knowledge base. Services and prices are in "Services and Price List", coverage and working hours in "Service Area and Availability", and common questions in "Frequently Asked Questions".

Never invent a price, an availability slot, a warranty term or a policy. If the answer is not in the knowledge base, say so and offer to have someone from the team follow up. Prices are in JMD.

Keep replies short — a couple of short paragraphs. Lead with the answer, then the next step. Offer to book a site visit, because every job starts with one.

Make clear that you are an AI assistant in your first reply, and again if the customer asks whether they are talking to a person.

If the customer is describing an active leak, offer the 24 hour emergency call-out. If they want a quote, give the package price and offer a site visit.`
