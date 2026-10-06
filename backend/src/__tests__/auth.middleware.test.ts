import { requireOwnerAccess } from '../middleware/auth';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

describe('requireOwnerAccess', () => {
  it('allows platform super admins', () => {
    const next = jest.fn();

    requireOwnerAccess({ user: { role: 'super_admin' } }, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('denies tenant admins', () => {
    const next = jest.fn();

    expect(() => requireOwnerAccess({ user: { role: 'admin', businessId: 'tenant-1' } }, {}, next))
      .toThrow(ForbiddenError);
    expect(next).not.toHaveBeenCalled();
  });

  it('requires authentication', () => {
    const next = jest.fn();

    expect(() => requireOwnerAccess({}, {}, next)).toThrow(UnauthorizedError);
    expect(next).not.toHaveBeenCalled();
  });
});