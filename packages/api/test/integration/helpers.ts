import { randomUUID } from 'node:crypto';
import { CreateTableCommand, DeleteTableCommand, waitUntilTableExists } from '@aws-sdk/client-dynamodb';
import type { ShiftRecord } from '@albapay/shared';
import { createDocumentClient, createDynamoClient } from '../../src/db/client';
import { Store } from '../../src/db/store';
import { tableDefinition } from '../../src/db/table';

export const ENDPOINT = process.env['DYNAMODB_ENDPOINT'] || 'http://localhost:8000';

/** 테스트 파일마다 이름이 다른 테이블을 만들어서 서로 영향을 주지 않게 한다. */
export async function createTestStore(): Promise<{ store: Store; drop: () => Promise<void> }> {
  const tableName = `albapay-test-${randomUUID()}`;
  const client = createDynamoClient({ tableName, endpoint: ENDPOINT });
  await client.send(new CreateTableCommand(tableDefinition(tableName)));
  await waitUntilTableExists({ client, maxWaitTime: 30, minDelay: 1, maxDelay: 2 }, { TableName: tableName });
  return {
    store: new Store(createDocumentClient(client), tableName),
    drop: async () => {
      await client.send(new DeleteTableCommand({ TableName: tableName }));
      client.destroy();
    },
  };
}

let sequence = 0;

export function shiftRecord(workDate: string, overrides: Partial<ShiftRecord> = {}): ShiftRecord {
  sequence += 1;
  return {
    id: `s${String(sequence).padStart(4, '0')}`,
    workDate,
    ruleId: null,
    kind: 'REGULAR',
    status: 'SCHEDULED',
    plannedStart: `${workDate}T18:00`,
    plannedEnd: `${workDate}T23:00`,
    plannedBreakMin: 0,
    actualStart: null,
    actualEnd: null,
    actualBreakMin: null,
    detached: false,
    memo: null,
    version: 1,
    updatedAt: '2026-11-02T08:00:00.000Z',
    ...overrides,
  };
}
