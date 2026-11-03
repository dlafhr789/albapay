import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from '../api/client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // 4xx는 다시 보내도 결과가 같다. 연결 실패와 5xx만 두 번까지 다시 시도한다.
      retry: (failureCount, error) =>
        failureCount < 2 && !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500),
    },
    mutations: { retry: false },
  },
});
