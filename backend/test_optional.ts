export const optionalAuth = async (
  req: any,
  res: any,
  next: any
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token) {
        const decoded = {} as any;
        const userId = (decoded.userId || decoded.id) as string;

        const dbUser = null;
        if (dbUser) {
        } else {
        }
      }
    } catch {
    }
    next();
  };