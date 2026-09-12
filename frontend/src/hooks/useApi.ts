import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'

export function useApiQuery<TData, TError = Error>(
  queryKey: (string | number | boolean | undefined | null)[],
  queryFn: () => Promise<TData>,
  options?: Omit<UseQueryOptions<TData, TError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey,
    queryFn,
    staleTime: 30000,
    ...options,
  })
}

export function useApiMutation<TData, TVariables = void, TError = Error>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: {
    onSuccess?: (data: TData, variables: TVariables) => void
    onError?: (error: TError, variables: TVariables) => void
    invalidateQueries?: (string | number | boolean | undefined | null)[][]
    successMessage?: string
    errorMessage?: string
  }
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: (data, variables) => {
      options?.onSuccess?.(data, variables)
      if (options?.successMessage) {
        // toast will be handled by caller or global toast
      }
      options?.invalidateQueries?.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key })
      })
    },
    onError: (error, variables) => {
      options?.onError?.(error as TError, variables)
    },
  })
}
