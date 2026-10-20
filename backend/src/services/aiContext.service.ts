import { query } from '../utils/database';
import { NotFoundError } from '../utils/errors';
import { generateEmbedding } from './embedding';
import { searchKnowledgeChunksHybrid } from './knowledge.service';

/**
 * Server side source of truth for the identity of a tenant.
 *
 * Every customer facing reply must name the business that owns the WhatsApp
 * number the customer wrote to. The AI model is not allowed to guess: it gets
 * the exact name from here and the greeting is even generated here when the
 * customer only says hello.
 */
export interface BusinessIdentity {
  id: string;
  name: string;
  slug: string;
  displayName: string;
  timezone: string;
  currency: string;
  greetingWord: string;
  resolved: boolean;
}

export interface AiContextOptions {
  businessId: string;
  message: string;
  limit?: number;
  includeKnowledge?: boolean;
}

export interface AiContextResult {
  business: BusinessIdentity;
  greeting: { isGreeting: boolean; reply: string } | null;
  knowledge: {
    count: number;
    maxSimilarity: number | null;
    confidence: 'none' | 'low' | 'medium' | 'high';
    hits: Array<{ chunk_text: string; source: string; similarity: number }>;
  };
  contextText: string;
  systemMessage: string;
  userMessage: string;
}

const GREETING_PATTERN =
  /^\s*(hi|hey|hello|yo|sup|hiya|good\s+(morning|afternoon|evening|night)|greetings|how\s+are\s+you|how('s|\s+is)\s+it\s+going|just\s+saying\s+hi)\b[\s!.?]*$/i;

export function isPureGreeting(message: string): boolean {
  return GREETING_PATTERN.test(String(message || '').trim());
}

export function getGreetingWord(timezone: string, now: Date = new Date()): string {
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: timezone || 'America/Jamaica', hour: '2-digit', hour12: false }).format(now)
    );
    if (Number.isNaN(hour)) return 'day';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 || hour < 4) return 'evening';
    return 'morning';
  } catch {
    return 'day';
  }
}

export async function getBusinessIdentity(businessId: string): Promise<BusinessIdentity> {
  const result = await query<{
    id: string;
    name: string | null;
    slug: string | null;
    timezone: string | null;
    currency: string | null;
  }>(
    `SELECT id, name, slug, timezone, currency
       FROM businesses
      WHERE id = $1::uuid AND deleted_at IS NULL
      LIMIT 1`,
    [businessId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError('Business not found');
  }

  const displayName = (row.name || row.slug || '').trim();
  const timezone = row.timezone || 'America/Jamaica';

  return {
    id: row.id,
    name: row.name || '',
    slug: row.slug || '',
    displayName,
    timezone,
    currency: row.currency || 'USD',
    greetingWord: getGreetingWord(timezone),
    resolved: displayName.length > 0,
  };
}

export function buildGreetingReply(identity: BusinessIdentity): string {
  if (!identity.resolved) {
    return `Good ${identity.greetingWord}! How can I help you today?`;
  }
  return `Good ${identity.greetingWord}! You're speaking with ${identity.displayName}. How can I help you today?`;
}

const SYSTEM_RULES = [
  'You are the WhatsApp sales assistant for the business identified in the CONTEXT block that is provided in the user message.',
  'The CONTEXT block is supplied by the platform and is authoritative.',
  'RULES:',
  '1. GREETING RULE: Only when the CUSTOMER MESSAGE is purely a greeting, reply warmly using the real business name from CONTEXT. For any other message, do not greet and answer from CONTEXT.',
  '2. You ARE the business named in CONTEXT. Use the business name exactly as written - never invent, guess, shorten or replace it, and never say "our company". If CONTEXT has no business name, do not name a company at all.',
  '3. Use the KNOWLEDGE and PRODUCTS in CONTEXT. Each KNOWLEDGE chunk carries [score X | source Y]: score >= 0.30 is a strong match, below that is weak and must be hedged.',
  '4. Never fabricate prices, hours or details that are not in CONTEXT.',
  '5. Replies: 1-2 concise sentences.',
  '6. Output only compact JSON (no markdown): {"reply":"...","intent":"general_inquiry","escalate":false,"escalation_reason":"","facts_extracted":[]}.',
].join('\n');

export async function buildAiContext(options: AiContextOptions): Promise<AiContextResult> {
  const { businessId, message } = options;
  const includeKnowledge = options.includeKnowledge !== false;

  const business = await getBusinessIdentity(businessId);

  let hits: AiContextResult['knowledge']['hits'] = [];
  let maxSimilarity: number | null = null;

  if (includeKnowledge && message && message.trim().length > 0) {
    try {
      const embedding = await generateEmbedding(message);
      const found = await searchKnowledgeChunksHybrid(
        embedding,
        message,
        true,
        businessId,
        options.limit || 10
      );
      hits = found.map((hit: any) => ({
        chunk_text: hit.chunk_text,
        source: hit.source || 'unknown',
        similarity: typeof hit.similarity === 'number' ? hit.similarity : 0,
      }));
      const scores = hits.map((hit) => hit.similarity);
      maxSimilarity = scores.length ? Math.max(...scores) : null;
    } catch {
      hits = [];
      maxSimilarity = null;
    }
  }

  const confidence: AiContextResult['knowledge']['confidence'] =
    maxSimilarity === null
      ? 'none'
      : maxSimilarity >= 0.3
        ? 'high'
        : maxSimilarity >= 0.1
          ? 'medium'
          : 'low';

  let contextText = '';
  if (business.resolved) {
    contextText += `AUTHORITATIVE BUSINESS IDENTITY: ${business.displayName}\n`;
    contextText += `YOUR BUSINESS NAME (copy it verbatim whenever you name the business): ${business.displayName}\n`;
  } else {
    contextText += 'AUTHORITATIVE BUSINESS IDENTITY: UNKNOWN (the tenant could not be resolved)\n';
    contextText += 'You must NOT name any company. Never invent or guess a business name.\n';
  }
  contextText += `BUSINESS TIMEZONE: ${business.timezone}\n`;
  contextText += `CURRENT GREETING WORD: ${business.greetingWord}\n`;
  contextText += `\nKNOWLEDGE CHUNKS AVAILABLE: ${hits.length}\n`;
  if (maxSimilarity !== null) {
    contextText += `KNOWLEDGE RELEVANCE: best score ${maxSimilarity.toFixed(3)} (${confidence}). Scores >= 0.30 are strong.\n`;
  }
  if (hits.length) {
    contextText += '\nAUTHORITATIVE KNOWLEDGE:\n';
    for (const hit of hits) {
      contextText += `- [score ${hit.similarity.toFixed(3)} | source ${hit.source}] ${hit.chunk_text}\n`;
    }
  } else {
    contextText += '\nAUTHORITATIVE KNOWLEDGE: none retrieved - say you do not have the answer and escalate.\n';
  }

  const greeting = isPureGreeting(message) ? { isGreeting: true, reply: buildGreetingReply(business) } : null;

  return {
    business,
    greeting,
    knowledge: { count: hits.length, maxSimilarity, confidence, hits },
    contextText,
    systemMessage: SYSTEM_RULES,
    userMessage: `${contextText}\n=== CUSTOMER MESSAGE ===\n${message}\n`,
  };
}
