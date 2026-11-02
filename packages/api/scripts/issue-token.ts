// API 토큰이나 캘린더 토큰을 새로 발급한다. 저장된 해시를 바꾸므로 이전 토큰은 바로 쓸 수 없게 된다.
// 사용: TABLE_NAME=<테이블> [DYNAMODB_ENDPOINT=<로컬 주소>] pnpm --filter @albapay/api issue-token <api|cal>
import { createDocumentClient, createDynamoClient, dbConfigFromEnv } from '../src/db/client';
import type { TokenKind } from '../src/db/keys';
import { Store } from '../src/db/store';
import { generateToken, hashToken } from '../src/http/auth';

const kind = process.argv[2];
if (kind !== 'api' && kind !== 'cal') {
  console.error('사용법: issue-token <api|cal>');
  process.exit(1);
}

const config = dbConfigFromEnv();
const client = createDynamoClient(config);
try {
  const token = generateToken();
  const store = new Store(createDocumentClient(client), config.tableName);
  await store.putTokenHash(kind as TokenKind, hashToken(token), new Date().toISOString());
  console.log(`새 ${kind} 토큰을 발급했습니다. 서버에는 해시만 저장되어 다시 볼 수 없으니 지금 복사하세요.\n`);
  console.log(token);
} finally {
  client.destroy();
}
