import { defineConfig } from 'vitest/config';

// DynamoDB 호환 엔드포인트(DYNAMODB_ENDPOINT, 기본값 http://localhost:8000)에 붙어서 돌린다.
// 저장소 루트에서 `docker compose up -d`로 DynamoDB Local을 띄운다.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.int.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
