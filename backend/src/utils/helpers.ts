export function getSortOrder(sortOrder?: string): 'asc' | 'desc' | undefined {
  if (sortOrder === 'asc' || sortOrder === 'desc') {
    return sortOrder;
  }
  return undefined;
}

export function getPagination(filters: Record<string, unknown>): {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
} {
  const page = typeof filters.page === 'string' ? parseInt(filters.page, 10) : undefined;
  const limit = typeof filters.limit === 'string' ? parseInt(filters.limit, 10) : undefined;
  const sortBy = typeof filters.sortBy === 'string' ? filters.sortBy : undefined;
  const sortOrder = getSortOrder(typeof filters.sortOrder === 'string' ? filters.sortOrder : undefined);

  return {
    page: typeof page === 'number' && !isNaN(page) && page >= 1 ? page : undefined,
    limit: typeof limit === 'number' && !isNaN(limit) && limit >= 1 ? limit : undefined,
    sortBy,
    sortOrder,
  };
}

export function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function getOptionalNumber(value: unknown): number | undefined {
  const num = typeof value === 'string' ? parseInt(value, 10) : typeof value === 'number' ? value : NaN;
  return !isNaN(num) ? num : undefined;
}
