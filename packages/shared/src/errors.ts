export type PayrollConfigErrorCode = 'NO_WAGE' | 'INVALID_PERIOD_START_DAY' | 'INVALID_SHIFT';

/** 설정이나 입력이 잘못돼서 계산할 수 없을 때 던진다. */
export class PayrollConfigError extends Error {
  readonly code: PayrollConfigErrorCode;

  constructor(code: PayrollConfigErrorCode, message: string) {
    super(message);
    this.name = 'PayrollConfigError';
    this.code = code;
  }
}
