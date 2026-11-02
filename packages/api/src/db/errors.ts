export type StoreErrorCode = 'NOT_FOUND' | 'VERSION_CONFLICT' | 'ALREADY_EXISTS';

/** 조건부 쓰기가 실패한 이유. HTTP와 무관하게 저장소 계층에서 던진다. */
export class StoreError extends Error {
  readonly code: StoreErrorCode;

  constructor(code: StoreErrorCode, message: string) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}

export function isAwsError(error: unknown, name: string): error is Error & Record<string, unknown> {
  return error instanceof Error && error.name === name;
}
