import { z } from 'zod';

// zod는 처음 스키마를 쓸 때 `new Function`이 되는지 시험한다. 배포 CSP(default-src 'self')는 이를 막고
// 오류를 잡아도 위반으로 기록하므로, 문자열 평가를 쓰지 않는 jitless 모드로 고정한다.
// 다른 모듈이 스키마를 만들기 전에 적용되도록 main.tsx에서 가장 먼저 불러온다.
z.config({ jitless: true });
