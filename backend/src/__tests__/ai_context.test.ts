import { isPureGreeting, getGreetingWord, buildGreetingReply } from '../services/aiContext.service';

jest.mock('../utils/database', () => ({
  query: jest.fn(),
}));

jest.mock('../services/embedding', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(768).fill(0.1)),
  EMBEDDING_MODEL: 'test-model',
}));

jest.mock('../services/knowledge.service', () => ({
  searchKnowledgeChunksHybrid: jest.fn().mockResolvedValue([]),
}));

describe('aiContext.service', () => {
  describe('isPureGreeting', () => {
    it('detects plain greetings', () => {
      expect(isPureGreeting('Hi')).toBe(true);
      expect(isPureGreeting('hello')).toBe(true);
      expect(isPureGreeting('  Good evening ')).toBe(true);
      expect(isPureGreeting('hey!')).toBe(true);
    });

    it('does not treat questions as greetings', () => {
      expect(isPureGreeting('What are your services?')).toBe(false);
      expect(isPureGreeting('Hi, I need a quote')).toBe(false);
      expect(isPureGreeting('')).toBe(false);
    });
  });

  describe('getGreetingWord', () => {
    const at = (hour: number) => new Date(Date.UTC(2026, 0, 1, hour, 0, 0));

    it('maps the hour to a greeting word', () => {
      expect(getGreetingWord('UTC', at(9))).toBe('morning');
      expect(getGreetingWord('UTC', at(14))).toBe('afternoon');
      expect(getGreetingWord('UTC', at(18))).toBe('evening');
      expect(getGreetingWord('UTC', at(2))).toBe('evening');
    });

    it('falls back to a safe value for a broken timezone', () => {
      expect(getGreetingWord('Not/AZone')).toBe('day');
    });
  });

  describe('buildGreetingReply', () => {
    it('always names the tenant business', () => {
      const reply = buildGreetingReply({
        id: 'b1',
        name: 'ROLINJ.IO - Automation & AI Solutions',
        slug: 'rolinj-io',
        displayName: 'ROLINJ.IO - Automation & AI Solutions',
        timezone: 'America/Jamaica',
        currency: 'USD',
        greetingWord: 'evening',
        resolved: true,
      });
      expect(reply).toBe(
        "Good evening! You're speaking with ROLINJ.IO - Automation & AI Solutions. How can I help you today?"
      );
      expect(reply).not.toMatch(/Acme/i);
    });

    it('does not invent a company name when the tenant is unknown', () => {
      const reply = buildGreetingReply({
        id: 'b1',
        name: '',
        slug: '',
        displayName: '',
        timezone: 'America/Jamaica',
        currency: 'USD',
        greetingWord: 'evening',
        resolved: false,
      });
      expect(reply).toBe('Good evening! How can I help you today?');
      expect(reply).not.toMatch(/speaking with/i);
    });
  });
});
