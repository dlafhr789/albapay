import { useState, type FormEvent } from 'react';
import type { ConfigResponse } from '@albapay/shared';
import { ApiRequestError, request } from '../api/client';
import { ErrorAlert } from '../ui/controls';
import { WalletIcon } from '../ui/icons';

/** 처음 열었을 때 API 토큰을 받는다. 저장하기 전에 서버에 한 번 물어봐서 맞는 토큰인지 확인한다. */
export function Welcome({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [checking, setChecking] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = token.trim();
    if (!value) return;
    setChecking(true);
    setError(null);
    try {
      await request<ConfigResponse>('GET', '/api/config', { token: value });
      onSignedIn(value);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError && caught.status === 401
          ? new ApiRequestError(401, 'UNAUTHORIZED', '토큰이 맞지 않아요. 발급받은 토큰을 다시 확인해 주세요.')
          : caught,
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-mark">
        <WalletIcon />
      </div>
      <h1>알바페이</h1>
      <p className="welcome-lead">
        근무를 기록하면 급여 계산과
        <br />
        애플 캘린더가 함께 맞춰져요.
      </p>
      <form onSubmit={submit}>
        <label htmlFor="token">API 토큰</label>
        <input
          id="token"
          className="text-input"
          type="password"
          autoComplete="off"
          placeholder="발급받은 토큰을 붙여넣으세요"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        <p className="hint">토큰은 이 기기에만 저장돼요. 홈 화면에 추가한 앱에서 입력해 주세요.</p>
        <ErrorAlert error={error} />
        <button className="button button--block" type="submit" disabled={checking || !token.trim()}>
          {checking ? '확인하는 중…' : '시작하기'}
        </button>
      </form>
    </div>
  );
}
