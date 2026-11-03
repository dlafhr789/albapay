// 로컬 개발용 API 서버. DynamoDB Local에 붙어서 Lambda와 같은 앱(createApp)을 Node 서버로 띄운다.
// 웹앱 개발 서버(Vite)가 /api 요청을 여기로 넘긴다.
//
// 사용: docker compose up -d && pnpm --filter @albapay/api dev
//
// 처음 띄우면 테이블을 만들고, 개발용 토큰(LOCAL_API_TOKEN, 기본값 local-dev-token)의 해시를 저장한다.
// 배포 테이블에 쓰지 않도록 DYNAMODB_ENDPOINT가 없으면 실행하지 않는다.
import { serve } from '@hono/node-server';
import { createApp } from '../src/app';
import { createDocumentClient, createDynamoClient } from '../src/db/client';
import { Store } from '../src/db/store';
import { ensureTable } from '../src/db/table';
import { hashToken } from '../src/http/auth';

const endpoint = process.env['DYNAMODB_ENDPOINT'] ?? 'http://localhost:8000';
const tableName = process.env['TABLE_NAME'] ?? 'albapay-local';
const token = process.env['LOCAL_API_TOKEN'] ?? 'local-dev-token';
const port = Number(process.env['PORT'] ?? 8787);

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(endpoint)) {
  console.error(`DYNAMODB_ENDPOINT가 로컬 주소가 아닙니다: ${endpoint}`);
  process.exit(1);
}

const client = createDynamoClient({ tableName, endpoint });
if (await ensureTable(client, tableName)) console.log(`테이블을 만들었습니다: ${tableName}`);

const store = new Store(createDocumentClient(client), tableName);
await store.putTokenHash('api', hashToken(token), new Date().toISOString());

serve({ fetch: createApp({ store }).fetch, hostname: '127.0.0.1', port }, (info) => {
  console.log(`API: http://127.0.0.1:${info.port}  (DynamoDB ${endpoint}, 테이블 ${tableName}, 토큰 ${token})`);
});
