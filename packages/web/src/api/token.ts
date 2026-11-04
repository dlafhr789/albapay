// API 토큰은 이 기기의 localStorage에만 둔다. 서버는 해시만 가지고 있어서 잃어버리면 새로 발급해야 한다.
// 사파리와 홈 화면에 추가한 앱은 저장소가 따로라서, 앱으로 쓸 곳에서 입력해야 한다.

const TOKEN_KEY = 'albapay.apiToken';

export function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // 저장할 수 없는 환경(사파리 개인 정보 보호 모드 등)이면 이번 세션 동안만 메모리에서 쓴다.
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 저장하지 못했으면 지울 것도 없다.
  }
}
