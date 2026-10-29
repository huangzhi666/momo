'use client'

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/client/api'
import type { AppStatus } from '@/lib/types'

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => apiGet<AppStatus>('/api/status'),
    staleTime: 20_000,
    retry: 1,
  })
}
