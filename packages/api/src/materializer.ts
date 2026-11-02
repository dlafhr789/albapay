// 매일 새벽 EventBridge Scheduler가 호출하는 Lambda 진입점.
// 반복 규칙의 근무를 오늘부터 MATERIALIZE_DAYS일 뒤까지 하루씩 더 채우고, 끝난 규칙의 남은 근무를 정리한다.
import { createDocumentClient, createDynamoClient, dbConfigFromEnv } from './db/client';
import { Store } from './db/store';
import { syncAllRules } from './ruleShifts';

const config = dbConfigFromEnv();
const store = new Store(createDocumentClient(createDynamoClient(config)), config.tableName);

export async function handler(): Promise<{ rules: number; created: number; removed: number }> {
  const result = await syncAllRules(store, new Date());
  console.info('Rules synced', result);
  return result;
}
