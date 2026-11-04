import type { ApiErrorBody, ApiErrorCode } from '@albapay/shared';
import { readToken } from './token';

/** 토큰이 틀리거나 바뀌었을 때 화면을 토큰 입력으로 돌리기 위한 이벤트 */
export const UNAUTHORIZED_EVENT = 'albapay:unauthorized';

type ClientErrorCode = ApiErrorCode | 'NETWORK' | 'FORBIDDEN';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export interface RequestOptions {
  body?: unknown;
  /** 저장된 토큰 대신 쓸 토큰. 토큰을 저장하기 전에 맞는지 확인할 때 쓴다. */
  token?: string;
}

/**
 * API를 부른다. 앱 토큰은 `X-App-Token`으로 보낸다. `Authorization`은 CloudFront OAC가 Lambda 서명에 쓴다.
 * 본문이 있으면 SHA-256을 `x-amz-content-sha256`에 넣는다. Lambda Function URL은 서명하지 않은 본문을 받지 않는다.
 */
export async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.token ?? readToken();
  const headers: Record<string, string> = {};
  if (token) headers['x-app-token'] = token;

  let body: string | undefined;
  if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers['content-type'] = 'application/json';
    headers['x-amz-content-sha256'] = await sha256Hex(body);
  }

  let response: Response;
  try {
    response = await fetch(path, { method, headers, cache: 'no-store', ...(body === undefined ? {} : { body }) });
  } catch {
    throw new ApiRequestError(0, 'NETWORK', '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (response.ok) return data as T;

  if (response.status === 401 && options.token === undefined) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (isErrorBody(data)) {
    throw new ApiRequestError(response.status, data.error.code, data.error.message, data.error.details ?? []);
  }
  // CloudFront나 Lambda Function URL이 앱보다 먼저 거부하면 본문이 우리 오류 형식이 아니다.
  if (response.status === 403) {
    throw new ApiRequestError(403, 'FORBIDDEN', '요청이 거부됐어요. 잠시 뒤 다시 시도해 주세요.');
  }
  throw new ApiRequestError(response.status, 'INTERNAL', `요청을 처리하지 못했어요. (${response.status})`);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const detail = error.details[0];
    return detail ? detail.message : error.message;
  }
  return '알 수 없는 오류가 생겼어요.';
}
