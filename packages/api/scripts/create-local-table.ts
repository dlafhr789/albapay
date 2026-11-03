// 로컬 DynamoDB(docker compose)에 개발용 테이블을 만든다. 이미 있으면 아무것도 하지 않는다.
// 사용: TABLE_NAME=albapay DYNAMODB_ENDPOINT=http://localhost:8000 pnpm --filter @albapay/api create-local-table
import { createDynamoClient, dbConfigFromEnv } from '../src/db/client';
import { ensureTable } from '../src/db/table';

const config = dbConfigFromEnv();
if (!config.endpoint) {
  console.error('DYNAMODB_ENDPOINT가 없습니다. 이 스크립트는 로컬 DynamoDB에만 테이블을 만듭니다.');
  process.exit(1);
}

const client = createDynamoClient(config);
try {
  const created = await ensureTable(client, config.tableName);
  console.log(created ? `테이블을 만들었습니다: ${config.tableName}` : `테이블이 이미 있습니다: ${config.tableName}`);
} finally {
  client.destroy();
}
