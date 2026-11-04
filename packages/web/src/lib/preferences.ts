import { useState } from 'react';

// 이 기기에서만 쓰는 화면 설정. 저장에 실패해도(사파리 개인 정보 보호 모드 등) 기본값으로 동작한다.

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 저장하지 못하면 이번에 열어 둔 동안만 기억한다.
  }
}

/** 문자열 값 하나를 기기에 기억한다. 저장된 값이 허용 목록에 없으면 기본값을 쓴다. */
export function useStoredChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = read(key);
    return allowed.includes(stored as T) ? (stored as T) : fallback;
  });
  return [
    value,
    (next: T) => {
      setValue(next);
      write(key, next);
    },
  ];
}
