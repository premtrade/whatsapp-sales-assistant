import { Request } from 'express';
import { headerTenantId, resolveRequestTenant } from '../utils/tenant';

const makeReq = (headers: Record<string, string | string[]> = {}, user?: any): Request =>
  ({ headers, user } as unknown as Request);

describe('tenant scoping', () => {
  describe('headerTenantId', () => {
    it('reads the X-Tenant-Id header', () => {
      expect(headerTenantId(makeReq({ 'x-tenant-id': 'tenant-1' }))).toBe('tenant-1');
    });

    it('handles an array header value', () => {
      expect(headerTenantId(makeReq({ 'x-tenant-id': ['tenant-2'] }))).toBe('tenant-2');
    });

    it('returns undefined for a missing or blank header', () => {
      expect(headerTenantId(makeReq())).toBeUndefined();
      expect(headerTenantId(makeReq({ 'x-tenant-id': '   ' }))).toBeUndefined();
    });
  });

  describe('resolveRequestTenant', () => {
    it('always scopes a tenant user to their own tenant', () => {
      const req = makeReq({ 'x-tenant-id': 'other-tenant' }, { businessId: 'own-tenant', role: 'admin' });
      expect(resolveRequestTenant(req)).toBe('own-tenant');
    });

    it('uses the selected tenant for the platform owner', () => {
      const req = makeReq({ 'x-tenant-id': 'selected-tenant' }, { role: 'super_admin' });
      expect(resolveRequestTenant(req)).toBe('selected-tenant');
    });

    it('returns undefined for the platform owner without a selection', () => {
      expect(resolveRequestTenant(makeReq({}, { role: 'super_admin' }))).toBeUndefined();
    });

    it('returns undefined for an unauthenticated request', () => {
      expect(resolveRequestTenant(makeReq())).toBeUndefined();
    });
  });
});
