import type { ApiErrorBody, ApiErrorCode } from '@albapay/shared';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

type Details = NonNullable<ApiErrorBody['error']['details']>;

/** 클라이언트에 그대로 돌려줄 오류. 라우트에서 던지면 공통 오류 처리기가 JSON으로 바꾼다. */
export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ApiErrorCode;
  readonly details: Details | undefined;

  constructor(status: ContentfulStatusCode, code: ApiErrorCode, message: string, details?: Details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toBody(): ApiErrorBody {
    return {
      error: { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) },
    };
  }
}

export const unauthorized = () => new ApiError(401, 'UNAUTHORIZED', '인증 토큰이 없거나 올바르지 않습니다.');
export const notFound = (message: string) => new ApiError(404, 'NOT_FOUND', message);
export const versionConflict = (message: string) => new ApiError(409, 'VERSION_CONFLICT', message);
