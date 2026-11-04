import {
  CreateTableCommand,
  DescribeTableCommand,
  type CreateTableCommandInput,
  type DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { isAwsError } from './errors';

/**
 * 로컬 개발과 통합 테스트에서 만드는 테이블. 키 구조는 배포용 Terraform 정의와 같아야 한다.
 * 배포 테이블은 상시 무료 한도에 맞춰 프로비저닝 모드로 만든다.
 */
export function tableDefinition(tableName: string): CreateTableCommandInput {
  return {
    TableName: tableName,
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  };
}

/** 테이블이 없으면 만든다. 새로 만들었으면 true */
export async function ensureTable(client: DynamoDBClient, tableName: string): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return false;
  } catch (error) {
    if (!isAwsError(error, 'ResourceNotFoundException')) throw error;
    await client.send(new CreateTableCommand(tableDefinition(tableName)));
    return true;
  }
}
