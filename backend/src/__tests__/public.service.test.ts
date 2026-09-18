import { checkSlugAvailability, checkPhoneAvailability, normalizeSlug, normalizePhone, validatePassword } from '../services/public.service';

describe('Public Service Validation', () => {
  describe('normalizeSlug', () => {
    it('should normalize a simple name to slug', () => {
      expect(normalizeSlug('Acme Corp')).toBe('acme-corp')
    })

    it('should convert to lowercase and replace spaces with hyphens', () => {
      expect(normalizeSlug('Hello World')).toBe('hello-world')
    })

    it('should remove leading and trailing hyphens', () => {
      expect(normalizeSlug('---test---')).toBe('test')
    })

    it('should reject empty slug', () => {
      expect(() => normalizeSlug('   ')).toThrow('Slug must contain alphanumeric characters')
    })

    it('should reject slug shorter than 3 chars', () => {
      expect(() => normalizeSlug('ab')).toThrow('Slug must be at least 3 characters')
    })

    it('should reject slug longer than 50 chars', () => {
      const longSlug = 'a'.repeat(51)
      expect(() => normalizeSlug(longSlug)).toThrow('Slug must be at most 50 characters')
    })
  })

  describe('normalizePhone', () => {
    it('should accept valid E.164 phone', () => {
      expect(normalizePhone('+18765551234')).toBe('+18765551234')
    })

    it('should trim whitespace', () => {
      expect(normalizePhone('  +18765551234  ')).toBe('+18765551234')
    })

    it('should reject invalid phone format', () => {
      expect(() => normalizePhone('not-a-phone')).toThrow('Phone number must be in E.164 format')
    })
  })

  describe('validatePassword', () => {
    it('should accept valid password', () => {
      expect(() => validatePassword('SecurePass1')).not.toThrow()
    })

    it('should reject password shorter than 8 chars', () => {
      expect(() => validatePassword('Short1')).toThrow('Password must be at least 8 characters')
    })

    it('should reject password without uppercase', () => {
      expect(() => validatePassword('securepass1')).toThrow('Password must contain at least one uppercase letter')
    })

    it('should reject password without number', () => {
      expect(() => validatePassword('SecurePass')).toThrow('Password must contain at least one number')
    })
  })
})
