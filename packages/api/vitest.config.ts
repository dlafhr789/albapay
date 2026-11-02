import { configDefaults, defineConfig } from 'vitest/config';

// 단위 테스트만 돌린다. 통합 테스트는 DynamoDB가 필요해서 vitest.integration.config.ts로 따로 돌린다.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'test/integration/**'],
  },
});
