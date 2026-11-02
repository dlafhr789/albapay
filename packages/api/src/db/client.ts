import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export const DEFAULT_REGION = 'ap-northeast-2';

export interface DbConfig {
  tableName: string;
  /** DynamoDB Local 같은 로컬 엔드포인트. 없으면 AWS의 DynamoDB를 쓴다. */
  endpoint?: string | undefined;
  region?: string | undefined;
}

export function dbConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DbConfig {
  const tableName = env['TABLE_NAME'];
  if (!tableName) throw new Error('TABLE_NAME 환경 변수가 없습니다.');
  return {
    tableName,
    endpoint: env['DYNAMODB_ENDPOINT'] || undefined,
    region: env['AWS_REGION'] || DEFAULT_REGION,
  };
}

/** 테이블 생성·삭제 같은 관리 작업용 저수준 클라이언트 */
export function createDynamoClient(config: DbConfig): DynamoDBClient {
  return new DynamoDBClient({
    region: config.region ?? DEFAULT_REGION,
    // 로컬 엔드포인트는 어떤 자격 증명이든 받지만, SDK는 값이 있어야 요청을 보낸다.
    ...(config.endpoint
      ? { endpoint: config.endpoint, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
      : {}),
  });
}

/** 아이템을 JS 객체로 읽고 쓰는 클라이언트. 저장소 계층은 이것만 쓴다. */
export function createDocumentClient(client: DynamoDBClient): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}
