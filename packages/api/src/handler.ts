// Lambda 진입점. CloudFront 뒤의 Lambda Function URL이 이 핸들러를 호출한다.
import { handle } from '@hono/aws-lambda';
import { createApp } from './app';
import { createDocumentClient, createDynamoClient, dbConfigFromEnv } from './db/client';
import { Store } from './db/store';

// 클라이언트는 호출마다 만들지 않고, 같은 실행 환경에서 재사용한다.
const config = dbConfigFromEnv();
const store = new Store(createDocumentClient(createDynamoClient(config)), config.tableName);

export const handler = handle(createApp({ store }));
