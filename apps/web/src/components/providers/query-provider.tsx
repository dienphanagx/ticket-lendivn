'use client';

import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

import { makeQueryClient } from '@/lib/query-client';

// 1 instance / tab; không tạo ở module scope (server render dùng chung giữa request → rò cache)
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
