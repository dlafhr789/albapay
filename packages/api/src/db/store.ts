import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type {
  AppSettings,
  ConfigResponse,
  DeductionProfile,
  LocalDate,
  PayrollResult,
  RuleRecord,
  ShiftRecord,
  WageEntry,
} from '@albapay/shared';
import { isAwsError, StoreError } from './errors';
import {
  CONFIG_PK,
  keys,
  monthsBetween,
  PAYSLIP_PK,
  RULE_PK,
  shiftPartition,
  type ItemKey,
  type TokenKind,
} from './keys';

type Item = Record<string, unknown>;

/** 정산 확정 기록. 확정 시점의 계산 결과를 그대로 보관한다. */
export interface PayslipRecord {
  periodStart: LocalDate;
  periodEnd: LocalDate;
  lockedAt: string;
  result: PayrollResult;
}

/** `version`이 기대한 값일 때만 쓰는 조건 */
function versionIs(expected: number) {
  return {
    ConditionExpression: '#version = :expected',
    ExpressionAttributeNames: { '#version': 'version' },
    ExpressionAttributeValues: { ':expected': expected },
  };
}

function stripKeys(item: Item): Item {
  const { PK: _pk, SK: _sk, entity: _entity, ...rest } = item;
  return rest;
}

function toShiftRecord(source: ShiftRecord): ShiftRecord {
  return {
    id: source.id,
    workDate: source.workDate,
    ruleId: source.ruleId ?? null,
    kind: source.kind,
    status: source.status,
    plannedStart: source.plannedStart,
    plannedEnd: source.plannedEnd,
    plannedBreakMin: source.plannedBreakMin,
    actualStart: source.actualStart ?? null,
    actualEnd: source.actualEnd ?? null,
    actualBreakMin: source.actualBreakMin ?? null,
    detached: source.detached ?? false,
    memo: source.memo ?? null,
    version: source.version,
    updatedAt: source.updatedAt,
  };
}

function toShiftItem(shift: ShiftRecord): Item {
  return { ...keys.shift(shift.workDate, shift.id), entity: 'SHIFT', jobId: 'main', ...toShiftRecord(shift) };
}

function toRuleRecord(source: RuleRecord): RuleRecord {
  return {
    id: source.id,
    slots: source.slots,
    startDate: source.startDate,
    endDate: source.endDate ?? null,
    intervalWeeks: source.intervalWeeks,
    skipDates: source.skipDates ?? [],
    materializedThrough: source.materializedThrough ?? null,
    version: source.version,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function toRuleItem(rule: RuleRecord): Item {
  return { ...keys.rule(rule.id), entity: 'RULE', ...toRuleRecord(rule) };
}

function sortShifts(shifts: ShiftRecord[]): ShiftRecord[] {
  return shifts.sort(
    (a, b) =>
      a.workDate.localeCompare(b.workDate) ||
      a.plannedStart.localeCompare(b.plannedStart) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * DynamoDB 테이블 하나에 대한 읽기·쓰기. 조건부 쓰기가 실패하면 `StoreError`를 던진다.
 * 사용자가 한 명이라 읽기는 모두 강한 일관성 읽기로 한다. 쓴 직후 목록에 바로 반영돼야 하기 때문이다.
 */
export class Store {
  constructor(
    private readonly db: DynamoDBDocumentClient,
    readonly tableName: string,
  ) {}

  private async get(key: ItemKey): Promise<Item | null> {
    const out = await this.db.send(
      new GetCommand({ TableName: this.tableName, Key: key, ConsistentRead: true }),
    );
    return out.Item ?? null;
  }

  private async put(item: Item): Promise<void> {
    await this.db.send(new PutCommand({ TableName: this.tableName, Item: item }));
  }

  /** 지운 아이템이 있었으면 true */
  private async delete(key: ItemKey): Promise<boolean> {
    const out = await this.db.send(
      new DeleteCommand({ TableName: this.tableName, Key: key, ReturnValues: 'ALL_OLD' }),
    );
    return out.Attributes !== undefined;
  }

  private async queryPartition(pk: string): Promise<Item[]> {
    const items: Item[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const out = await this.db.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': pk },
          ConsistentRead: true,
          ExclusiveStartKey: startKey,
        }),
      );
      items.push(...(out.Items ?? []));
      startKey = out.LastEvaluatedKey;
    } while (startKey);
    return items;
  }

  // ── 토큰 ──────────────────────────────────────────────

  async getTokenHash(kind: TokenKind): Promise<string | null> {
    const item = await this.get(keys.token(kind));
    const hash = item?.['hash'];
    return typeof hash === 'string' ? hash : null;
  }

  /** 토큰을 언제 만들었는지까지 읽는다. 해시는 돌려주지 않는다. */
  async getTokenInfo(kind: TokenKind): Promise<{ createdAt: string } | null> {
    const item = await this.get(keys.token(kind));
    const createdAt = item?.['createdAt'];
    return typeof createdAt === 'string' ? { createdAt } : null;
  }

  async putTokenHash(kind: TokenKind, hash: string, createdAt: string): Promise<void> {
    await this.put({ ...keys.token(kind), entity: 'TOKEN', hash, createdAt });
  }

  /** 토큰을 지운다. 지울 토큰이 없었으면 false */
  async deleteToken(kind: TokenKind): Promise<boolean> {
    return this.delete(keys.token(kind));
  }

  // ── 설정 ──────────────────────────────────────────────

  /** 설정, 시급 이력, 공제 이력을 Query 한 번으로 읽는다. 이력은 적용 시작일 순이다. */
  async loadConfig(): Promise<ConfigResponse> {
    let settings: AppSettings | null = null;
    const wages: WageEntry[] = [];
    const deductions: DeductionProfile[] = [];
    for (const item of await this.queryPartition(CONFIG_PK)) {
      const sk = String(item['SK']);
      if (sk === 'SETTINGS') {
        settings = stripKeys(item) as AppSettings;
      } else if (sk.startsWith('WAGE#')) {
        wages.push({
          effectiveFrom: item['effectiveFrom'] as LocalDate,
          hourlyWage: item['hourlyWage'] as number,
        });
      } else if (sk.startsWith('DEDUCT#')) {
        deductions.push(stripKeys(item) as DeductionProfile);
      }
    }
    return { settings, wages, deductions };
  }

  async putSettings(settings: AppSettings): Promise<void> {
    await this.put({ ...keys.settings(), entity: 'SETTINGS', ...settings });
  }

  async putWage(entry: WageEntry): Promise<void> {
    await this.put({ ...keys.wage(entry.effectiveFrom), entity: 'WAGE', ...entry });
  }

  async deleteWage(effectiveFrom: LocalDate): Promise<boolean> {
    return this.delete(keys.wage(effectiveFrom));
  }

  async putDeduction(profile: DeductionProfile): Promise<void> {
    await this.put({ ...keys.deduction(profile.effectiveFrom), entity: 'DEDUCTION', ...profile });
  }

  async deleteDeduction(effectiveFrom: LocalDate): Promise<boolean> {
    return this.delete(keys.deduction(effectiveFrom));
  }

  // ── 근무 ──────────────────────────────────────────────

  async listShiftsByMonth(yearMonth: string): Promise<ShiftRecord[]> {
    const items = await this.queryPartition(shiftPartition(yearMonth));
    return sortShifts(items.map((item) => toShiftRecord(item as unknown as ShiftRecord)));
  }

  /** `from`~`to`(양 끝 포함)의 근무. 걸쳐 있는 달마다 Query 한 번씩 한다. */
  async listShiftsBetween(from: LocalDate, to: LocalDate): Promise<ShiftRecord[]> {
    const months = await Promise.all(
      monthsBetween(from, to).map((month) => this.queryPartition(shiftPartition(month))),
    );
    return sortShifts(
      months
        .flat()
        .map((item) => toShiftRecord(item as unknown as ShiftRecord))
        .filter((shift) => from <= shift.workDate && shift.workDate <= to),
    );
  }

  async getShift(workDate: LocalDate, id: string): Promise<ShiftRecord | null> {
    const item = await this.get(keys.shift(workDate, id));
    return item ? toShiftRecord(item as unknown as ShiftRecord) : null;
  }

  async createShift(shift: ShiftRecord): Promise<void> {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.tableName,
          Item: toShiftItem(shift),
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      );
    } catch (error) {
      if (isAwsError(error, 'ConditionalCheckFailedException')) {
        throw new StoreError('ALREADY_EXISTS', `이미 있는 근무입니다: ${shift.id}`);
      }
      throw error;
    }
  }

  /** 같은 키의 근무를 통째로 바꾼다. 저장된 `version`이 `expectedVersion`일 때만 쓴다. */
  async replaceShift(shift: ShiftRecord, expectedVersion: number): Promise<void> {
    try {
      await this.db.send(
        new PutCommand({ TableName: this.tableName, Item: toShiftItem(shift), ...versionIs(expectedVersion) }),
      );
    } catch (error) {
      if (isAwsError(error, 'ConditionalCheckFailedException')) {
        throw await this.conflictFor(shift.workDate, shift.id);
      }
      throw error;
    }
  }

  async deleteShift(workDate: LocalDate, id: string, expectedVersion: number): Promise<void> {
    try {
      await this.db.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: keys.shift(workDate, id),
          ...versionIs(expectedVersion),
        }),
      );
    } catch (error) {
      if (isAwsError(error, 'ConditionalCheckFailedException')) {
        throw await this.conflictFor(workDate, id);
      }
      throw error;
    }
  }

  /**
   * 근무 날짜를 바꾼다. 날짜가 키에 들어 있어서 원래 아이템을 지우고(또는 바꾸고) 새 아이템을 만드는
   * 두 쓰기를 트랜잭션 하나로 묶는다. 둘 중 하나라도 조건에 걸리면 아무것도 바뀌지 않는다.
   *
   * @param replacement 원래 키에 남길 근무. null이면 원래 아이템을 지운다.
   *   규칙에서 생긴 근무는 지우면 매일 도는 펼치기 작업이 다시 만들기 때문에 `CANCELLED`로 남긴다.
   */
  async moveShift(
    original: { workDate: LocalDate; id: string; expectedVersion: number },
    replacement: ShiftRecord | null,
    created: ShiftRecord,
  ): Promise<void> {
    if (replacement && (replacement.workDate !== original.workDate || replacement.id !== original.id)) {
      throw new Error('replacement는 원래 근무와 키가 같아야 합니다.');
    }
    const condition = versionIs(original.expectedVersion);
    const first = replacement
      ? { Put: { TableName: this.tableName, Item: toShiftItem(replacement), ...condition } }
      : { Delete: { TableName: this.tableName, Key: keys.shift(original.workDate, original.id), ...condition } };
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            first,
            {
              Put: {
                TableName: this.tableName,
                Item: toShiftItem(created),
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (isAwsError(error, 'TransactionCanceledException')) {
        const reasons = (error['CancellationReasons'] as { Code?: string }[] | undefined) ?? [];
        if (reasons[0]?.Code === 'ConditionalCheckFailed') {
          throw await this.conflictFor(original.workDate, original.id);
        }
        if (reasons[1]?.Code === 'ConditionalCheckFailed') {
          throw new StoreError('ALREADY_EXISTS', `옮길 자리에 이미 근무가 있습니다: ${created.id}`);
        }
      }
      throw error;
    }
  }

  /**
   * 사용자가 따로 고치지 않은 근무(`detached`가 false)일 때만 지운다. 규칙의 범위가 줄어서 필요 없어진
   * 근무를 지울 때 쓴다. 읽은 뒤 그사이 사용자가 고쳤으면 지우지 않고 false를 돌려준다.
   */
  async deleteUntouchedShift(workDate: LocalDate, id: string): Promise<boolean> {
    try {
      await this.db.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: keys.shift(workDate, id),
          ConditionExpression: 'detached = :untouched',
          ExpressionAttributeValues: { ':untouched': false },
        }),
      );
      return true;
    } catch (error) {
      if (isAwsError(error, 'ConditionalCheckFailedException')) return false;
      throw error;
    }
  }

  /** 조건부 쓰기가 실패했을 때, 아이템이 없어서인지 다른 곳에서 먼저 고쳐서인지 구분한다. */
  private async conflictFor(workDate: LocalDate, id: string): Promise<StoreError> {
    const current = await this.getShift(workDate, id);
    return current
      ? new StoreError('VERSION_CONFLICT', `다른 곳에서 먼저 수정된 근무입니다: ${id}`)
      : new StoreError('NOT_FOUND', `근무가 없습니다: ${id}`);
  }

  // ── 반복 규칙 ─────────────────────────────────────────

  /** 시작일 순 */
  async listRules(): Promise<RuleRecord[]> {
    const items = await this.queryPartition(RULE_PK);
    return items
      .map((item) => toRuleRecord(item as unknown as RuleRecord))
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
  }

  async getRule(id: string): Promise<RuleRecord | null> {
    const item = await this.get(keys.rule(id));
    return item ? toRuleRecord(item as unknown as RuleRecord) : null;
  }

  async createRule(rule: RuleRecord): Promise<void> {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.tableName,
          Item: toRuleItem(rule),
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      );
    } catch (error) {
      if (isAwsError(error, 'ConditionalCheckFailedException')) {
        throw new StoreError('ALREADY_EXISTS', `이미 있는 규칙입니다: ${rule.id}`);
      }
      throw error;
    }
  }

  /** 규칙을 통째로 바꾼다. 저장된 `version`이 `expectedVersion`일 때만 쓴다. */
  async replaceRule(rule: RuleRecord, expectedVersion: number): Promise<void> {
    try {
      await this.db.send(
        new PutCommand({ TableName: this.tableName, Item: toRuleItem(rule), ...versionIs(expectedVersion) }),
      );
    } catch (error) {
      if (isAwsError(error, 'ConditionalCheckFailedException')) throw await this.ruleConflictFor(rule.id);
      throw error;
    }
  }

  /**
   * 규칙을 날짜 하나를 기준으로 둘로 나눈다. 기존 규칙(`previous`, 종료일을 당긴 것)을 고치는 쓰기와
   * 새 규칙(`next`)을 만드는 쓰기를 트랜잭션 하나로 묶어서, 한쪽만 반영되는 일이 없게 한다.
   */
  async splitRule(previous: RuleRecord, expectedVersion: number, next: RuleRecord): Promise<void> {
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: { TableName: this.tableName, Item: toRuleItem(previous), ...versionIs(expectedVersion) } },
            {
              Put: {
                TableName: this.tableName,
                Item: toRuleItem(next),
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (isAwsError(error, 'TransactionCanceledException')) {
        const reasons = (error['CancellationReasons'] as { Code?: string }[] | undefined) ?? [];
        if (reasons[0]?.Code === 'ConditionalCheckFailed') throw await this.ruleConflictFor(previous.id);
        if (reasons[1]?.Code === 'ConditionalCheckFailed') {
          throw new StoreError('ALREADY_EXISTS', `이미 있는 규칙입니다: ${next.id}`);
        }
      }
      throw error;
    }
  }

  async deleteRule(id: string): Promise<boolean> {
    return this.delete(keys.rule(id));
  }

  private async ruleConflictFor(id: string): Promise<StoreError> {
    return (await this.getRule(id))
      ? new StoreError('VERSION_CONFLICT', `다른 곳에서 먼저 수정된 규칙입니다: ${id}`)
      : new StoreError('NOT_FOUND', `규칙이 없습니다: ${id}`);
  }

  /**
   * 근무를 어디까지 펼쳤는지만 바꾼다. 사용자가 고친 것이 아니라서 `version`은 그대로 둔다.
   * 그사이 규칙이 지워졌으면 아무것도 쓰지 않고 false를 돌려준다.
   */
  async setRuleMaterializedThrough(id: string, date: LocalDate | null): Promise<boolean> {
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: keys.rule(id),
          UpdateExpression: 'SET materializedThrough = :date',
          ConditionExpression: 'attribute_exists(PK)',
          ExpressionAttributeValues: { ':date': date },
        }),
      );
      return true;
    } catch (error) {
      if (isAwsError(error, 'ConditionalCheckFailedException')) return false;
      throw error;
    }
  }

  // ── 정산 확정 ─────────────────────────────────────────

  async listPayslips(): Promise<PayslipRecord[]> {
    const items = await this.queryPartition(PAYSLIP_PK);
    return items.map((item) => stripKeys(item) as unknown as PayslipRecord);
  }

  async getPayslip(periodStart: LocalDate): Promise<PayslipRecord | null> {
    const item = await this.get(keys.payslip(periodStart));
    return item ? (stripKeys(item) as unknown as PayslipRecord) : null;
  }

  /** 새로 확정했으면 true, 이미 확정돼 있었으면 false */
  async createPayslip(payslip: PayslipRecord): Promise<boolean> {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.tableName,
          Item: { ...keys.payslip(payslip.periodStart), entity: 'PAYSLIP', ...payslip },
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      );
      return true;
    } catch (error) {
      if (isAwsError(error, 'ConditionalCheckFailedException')) return false;
      throw error;
    }
  }

  async deletePayslip(periodStart: LocalDate): Promise<boolean> {
    return this.delete(keys.payslip(periodStart));
  }
}
