# 데이터 모델

DynamoDB 테이블 하나에 모든 아이템을 담는다. 근무는 월 단위 파티션에 넣어서 달력, 정산, 캘린더 피드가 모두 월별 Query 몇 번으로 끝나고, 보조 인덱스(GSI)는 두지 않는다. 구현은 `packages/api/src/db`에 있다.

## 키

키는 문자열 두 개(`PK`, `SK`)다. 모든 아이템에는 읽기 편하도록 종류를 나타내는 `entity` 속성이 있다.

| 종류 | PK | SK | 속성 |
| --- | --- | --- | --- |
| 설정 | `CONFIG` | `SETTINGS` | `hireDate`, `periodStartDay`, `payDay`, `weekStartsOn`, `weeklyHolidayMode`, `eventTitle`, `showPayInEvent`, `eventTravelMin`, `eventAlertMin` |
| 시급 이력 | `CONFIG` | `WAGE#<적용 시작일>` | `effectiveFrom`, `hourlyWage` |
| 공제 이력 | `CONFIG` | `DEDUCT#<적용 시작일>` | `effectiveFrom`, `type`, 항목별 요율 |
| 토큰 | `CONFIG` | `TOKEN#api`, `TOKEN#cal` | `hash`(SHA-256), `createdAt` |
| 근무 | `SHIFT#<YYYY-MM>` | `<workDate>#<id>` | 아래 표 |
| 반복 규칙 | `RULE` | `<id>` | 아래 표 |
| 정산 확정 | `PAYSLIP` | `<정산 기간 시작일>` | `periodStart`, `periodEnd`, `lockedAt`, `result` |

시급과 공제 요율은 덮어쓰지 않고 적용 시작일마다 아이템을 하나씩 쌓는다. 그래야 최저임금이 바뀌는 1월 1일 전후의 근무가 각자 맞는 시급으로 계산된다. 같은 적용 시작일로 다시 저장하면 그 이력의 값을 고친다.

## 근무 아이템

| 속성 | 타입 | 설명 |
| --- | --- | --- |
| `id` | 문자열 | 직접 추가한 근무는 ULID. 반복 규칙에서 생긴 근무는 `r_<ruleId>_<YYYYMMDD>` |
| `workDate` | 날짜 | 시작 시각의 날짜. 밤샘 근무도 시작한 날에 속한다 |
| `jobId` | 문자열 | 지금은 항상 `main`. 근무지를 여러 곳으로 늘릴 때를 위해 둔다 |
| `ruleId` | 문자열 또는 null | 반복 규칙에서 생긴 근무면 그 규칙 ID |
| `kind` | `REGULAR` / `EXTRA` | 계약 근무 / 대타·추가 근무 |
| `status` | `SCHEDULED` / `WORKED` / `ABSENT` / `CANCELLED` | 예정, 근무함(실제 시각 있음), 결근, 빠진 날 |
| `plannedStart`, `plannedEnd`, `plannedBreakMin` | 시각, 시각, 분 | 예정 시각과 무급 휴게 |
| `actualStart`, `actualEnd`, `actualBreakMin` | 시각 또는 null | `WORKED`일 때만 있다 |
| `detached` | 불리언 | 규칙에서 생긴 근무를 따로 고쳤으면 true. 규칙을 바꿔도 다시 만들지 않는다 |
| `memo` | 문자열 또는 null | |
| `version` | 정수 | 낙관적 잠금용. 쓸 때마다 1씩 오른다 |
| `updatedAt` | ISO 8601 | 마지막으로 쓴 시각(UTC) |

## 반복 규칙 아이템

| 속성 | 타입 | 설명 |
| --- | --- | --- |
| `id` | 문자열 | ULID |
| `slots` | 목록 | 요일(`dayOfWeek`, 0이 일요일)별 `start`, `end`(`HH:mm`), `breakMin`. 같은 요일은 한 번만 있다 |
| `startDate`, `endDate` | 날짜, 날짜 또는 null | 첫 근무 날짜와 마지막 근무 날짜. `endDate`가 null이면 끝이 없다 |
| `intervalWeeks` | 1 또는 2 | 매주, 격주 |
| `skipDates` | 날짜 목록 | 근무를 만들지 않는 날짜 |
| `materializedThrough` | 날짜 또는 null | 이 날짜까지 근무를 만들었다 |
| `version` | 정수 | 낙관적 잠금용. 사용자가 규칙을 바꿀 때만 오른다 |
| `createdAt`, `updatedAt` | ISO 8601 | |

규칙에서 생긴 근무는 근무 아이템으로 따로 저장된다. 규칙은 근무를 만드는 데만 쓰이고, 달력이나 정산은 규칙을 읽지 않는다.

## 값 표현

- 날짜는 `YYYY-MM-DD`, 시각은 오프셋 없는 `YYYY-MM-DDTHH:mm`이고 모두 서울 시각으로 해석한다.
- 금액은 원 단위 정수, 시간은 분 단위 정수, 요율은 백만분율 정수(4.75% → 47500)다.

## 접근 패턴

| 작업 | 요청 |
| --- | --- |
| 월 달력 | `PK = SHIFT#2026-11` Query 1회 |
| 정산 계산 | 정산 기간 첫 주보다 3주 앞부터 기간 끝까지 걸친 달마다 Query. 4주 평균을 내기 위해서이고 보통 2~3회다 |
| 설정 읽기 | `PK = CONFIG` Query 1회로 설정과 시급·공제 이력을 한 번에 읽는다 |
| 확정 기간 확인 | `PK = PAYSLIP` Query 1회 |
| 규칙 목록, 매일 근무 채우기 | `PK = RULE` Query 1회. 채울 때는 근무마다 조건부 PutItem |
| 토큰 확인 | `CONFIG / TOKEN#api` GetItem 1회 |
| 캘린더 피드 | `CONFIG / TOKEN#cal` GetItem 1회, `PK = CONFIG` Query 1회, 입사일부터 오늘의 120일 뒤까지 걸친 달마다 Query. 한 해 쓰면 16회쯤이고, 근무 아이템이 작아서 1년에 몇 회씩 늘어도 무료 한도 안이다 |

사용자가 한 명이라 읽기는 모두 강한 일관성 읽기로 한다. 쓴 직후 목록에 바로 반영돼야 하고, 읽기 비용이 두 배가 돼도 무료 한도와 거리가 멀다.

## 쓰기 규칙

- **동시 수정**: 근무를 고치거나 지울 때는 저장된 `version`이 클라이언트가 읽은 값과 같을 때만 쓴다. 조건에 걸리면 다시 읽어서, 아이템이 없으면 `NOT_FOUND`, 있으면 `VERSION_CONFLICT`로 구분한다.
- **날짜 이동**: 날짜가 키에 들어 있어서 날짜를 바꾸면 키가 바뀐다. 원래 아이템을 지우는 쓰기와 새 아이템을 만드는 쓰기를 `TransactWriteItems` 하나로 묶어서, 한쪽만 반영되는 일이 없게 한다.
- **근무 펼치기**: 규칙의 `materializedThrough` 다음 날부터 오늘의 90일 뒤까지 근무를 만들고 `materializedThrough`를 옮긴다. 근무는 `attribute_not_exists(PK)` 조건으로 만들어서 이미 있으면 건너뛴다. 중간에 실패해도 다음 실행이 같은 날짜부터 다시 만들고, 그사이 사용자가 고친 근무는 덮어쓰지 않는다. `materializedThrough`만 바꿀 때는 `version`을 올리지 않는다. 사용자가 규칙을 읽은 뒤 고치는 사이에 매일 도는 작업이 끼어도 충돌로 보지 않기 위해서다.
- **규칙에서 생긴 근무**: 사용자가 지우면 아이템을 지우지 않고 `CANCELLED`로 바꾸고 `detached`를 켠다. 아이템이 없으면 펼치기를 다시 돌릴 때 같은 ID로 되살아나고, 규칙을 나눌 때 그날을 뺐다는 사실도 사라진다. 날짜를 옮길 때도 원래 자리에는 `CANCELLED`로 남기고, 새 날짜에는 새 ID로 직접 추가한 근무를 만든다.
- **규칙 나누기**: 기존 규칙의 종료일을 당기는 쓰기와 새 규칙을 만드는 쓰기를 `TransactWriteItems` 하나로 묶는다. 새 규칙의 `skipDates`에는 기존 규칙에서 따로 고친 근무가 남아 있는 날짜를 넣는다.
- **범위가 줄어든 근무 정리**: 종료일보다 `materializedThrough`가 뒤에 있으면 아직 정리하지 않은 근무가 있다는 표시다. 그 사이의 근무 중 `detached`가 false인 것만 `detached = false` 조건으로 지우고, 다 지우면 `materializedThrough`를 종료일로 맞춘다. 중간에 실패하면 표시가 남아서 매일 도는 작업이 이어서 정리한다. 종료일이 시작일보다 앞이 된 규칙은 정리가 끝난 뒤 아이템을 지운다.

## 이렇게 정한 이유

- **월 단위 파티션**: 한 사람의 근무는 1년에 수백 건이라 한 파티션이 커질 일이 없다. 달력과 정산이 모두 날짜 범위로 읽는데, 범위가 월 단위로 잘려서 Query 몇 번으로 끝난다.
- **GSI 없음**: 모든 접근 패턴이 `PK`로 해결된다. GSI를 두면 쓰기 용량을 따로 잡아야 한다.
- **테이블 하나**: 배포 테이블은 상시 무료 한도(읽기·쓰기 용량 각 25)에 맞춰 프로비저닝 모드로 만든다. 테이블을 나누면 용량을 테이블마다 나눠 잡아야 한다.
