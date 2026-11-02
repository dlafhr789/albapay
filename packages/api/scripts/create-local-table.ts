// 로컬 DynamoDB(docker compose)에 개발용 테이블을 만든다. 이미 있으면 아무것도 하지 않는다.
// 사용: TABLE_NAME=albapay DYNAMODB_ENDPOINT=http://localhost:8000 pnpm --filter @albapay/api create-local-table
import { CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { createDynamoClient, dbConfigFromEnv } from '../src/db/client';
import { isAwsError } from '../src/db/errors';
import { tableDefinition } from '../src/db/table';

const config = dbConfigFromEnv();
if (!config.endpoint) {
  console.error('DYNAMODB_ENDPOINT가 없습니다. 이 스크립트는 로컬 DynamoDB에만 테이블을 만듭니다.');
  process.exit(1);
}

const client = createDynamoClient(config);
try {
  await client.send(new DescribeTableCommand({ TableName: config.tableName }));
  console.log(`테이블이 이미 있습니다: ${config.tableName}`);
} catch (error) {
  if (!isAwsError(error, 'ResourceNotFoundException')) throw error;
  await client.send(new CreateTableCommand(tableDefinition(config.tableName)));
  console.log(`테이블을 만들었습니다: ${config.tableName}`);
} finally {
  client.destroy();
}
