import './zod';
// Pretendard 가변 글꼴. 글자 범위별로 나뉜 파일 중 화면에 나온 글자의 파일만 받는다. 굵기는 한 파일에 다 들어 있다.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

const root = document.getElementById('root');
if (!root) throw new Error('#root 요소가 없습니다.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
