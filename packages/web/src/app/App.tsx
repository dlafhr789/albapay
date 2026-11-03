import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { UNAUTHORIZED_EVENT } from '../api/client';
import { clearToken, readToken, saveToken } from '../api/token';
import { Welcome } from '../screens/Welcome';
import { queryClient } from './queryClient';
import { Routes } from './Routes';

export function App() {
  const [token, setToken] = useState(readToken);

  useEffect(() => {
    // 서버가 401을 돌려주면(토큰을 다시 발급한 경우 등) 저장된 토큰을 지우고 입력 화면으로 돌아간다.
    function signOut() {
      clearToken();
      queryClient.clear();
      setToken(null);
    }
    window.addEventListener(UNAUTHORIZED_EVENT, signOut);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, signOut);
  }, []);

  if (!token) {
    return (
      <Welcome
        onSignedIn={(value) => {
          saveToken(value);
          setToken(value);
        }}
      />
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Routes />
    </QueryClientProvider>
  );
}
