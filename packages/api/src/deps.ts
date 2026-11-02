import type { Store } from './db/store';

export interface AppDeps {
  store: Store;
  /** 테스트에서 시각을 고정하려고 주입한다. */
  now: () => Date;
  /** 직접 추가하는 근무와 반복 규칙의 ID */
  newId: () => string;
}
