import publicRoutes from '../routes/public.routes';

describe('Public Routes Structure', () => {
  it('should export a valid Express router', () => {
    expect(publicRoutes).toBeDefined()
    expect(typeof publicRoutes).toBe('function')
  })
})
