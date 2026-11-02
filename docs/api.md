# API

모든 요청은 CloudFront 도메인의 `/api/*`로 보내고 JSON으로 주고받는다. 요청·응답 스키마는 [`packages/shared/src/api.ts`](../packages/shared/src/api.ts)에 있고 웹과 Lambda가 같은 정의를 쓴다. 응답에는 `Cache-Control: no-store`가 붙는다.

## 인증

모든 요청에 `X-App-Token` 헤더로 토큰을 보낸다.

- `Authorization` 헤더는 쓰지 않는다. CloudFront OAC가 Lambda Function URL로 보내는 요청에 자기 서명을 이 헤더로 넣기 때문이다.
- 서버는 토큰의 SHA-256 해시만 저장하고, 받은 토큰의 해시와 상수 시간으로 비교한다.
- 토큰이 없거나 틀리면 경로가 있든 없든 `401`을 돌려준다. 토큰 없이는 어떤 경로가 있는지도 알 수 없다.

토큰은 로컬에서 스크립트로 발급한다. 새로 발급하면 저장된 해시가 바뀌어서 이전 토큰은 바로 쓸 수 없게 된다.

```bash
TABLE_NAME=<테이블> pnpm --filter @albapay/api issue-token api
```

## 오류

오류 응답의 본문은 항상 같은 형태다.

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "요청 값이 올바르지 않습니다.",
    "details": [{ "path": "planned.end", "message": "시작과 종료 시각이 같습니다." }]
  }
}
```

| 상태 | code | 상황 |
| --- | --- | --- |
| 400 | `VALIDATION` | 본문이 JSON이 아니거나 스키마에 맞지 않음. `details`에 필드별 이유가 있다 |
| 401 | `UNAUTHORIZED` | 토큰이 없거나 틀림 |
| 404 | `NOT_FOUND` | 대상이나 경로가 없음 |
| 409 | `VERSION_CONFLICT` | 다른 곳에서 먼저 수정됨. 다시 불러온 뒤 수정해야 한다 |
| 409 | `NOT_CONFIGURED` | 설정이나 시급 이력이 없어 계산할 수 없음 |
| 500 | `INTERNAL` | 서버 오류. 자세한 내용은 Lambda 로그에만 남는다 |

## 설정

| 메서드 | 경로 | 하는 일 | 응답 |
| --- | --- | --- | --- |
| GET | `/api/config` | 설정, 시급 이력, 공제 이력을 한 번에 읽는다 | 200 |
| PUT | `/api/config/settings` | 설정을 통째로 저장한다 | 200 |
| PUT | `/api/config/wages/{effectiveFrom}` | 그날부터 적용할 시급을 저장한다. 같은 날짜로 다시 저장하면 고친다 | 200 |
| DELETE | `/api/config/wages/{effectiveFrom}` | 시급 이력을 지운다 | 204, 없으면 404 |
| PUT | `/api/config/deductions/{effectiveFrom}` | 그날부터 적용할 공제 방식을 저장한다 | 200 |
| DELETE | `/api/config/deductions/{effectiveFrom}` | 공제 이력을 지운다 | 204, 없으면 404 |

`GET /api/config` 응답이다. 아직 저장하지 않은 설정은 `null`이고, 이력은 적용 시작일 순이다.

```json
{
  "settings": {
    "hireDate": "2026-03-02",
    "periodStartDay": 1,
    "payDay": 10,
    "weekStartsOn": 1,
    "weeklyHolidayMode": "FOUR_WEEK_AVERAGE",
    "eventTitle": "알바",
    "showPayInEvent": true
  },
  "wages": [
    { "effectiveFrom": "2026-03-02", "hourlyWage": 10320 },
    { "effectiveFrom": "2027-01-01", "hourlyWage": 10700 }
  ],
  "deductions": [{ "effectiveFrom": "2026-03-02", "type": "WITHHOLDING", "businessIncomeTaxPpm": 30000, "localIncomeTaxPpm": 100000 }]
}
```

- `periodStartDay`, `payDay`는 1~28이다. 29~31일은 2월에 없어서 받지 않는다.
- `weekStartsOn`은 주휴수당을 세는 주의 첫 요일이다. 0이 일요일, 1이 월요일이다.
- 공제 본문은 `type`에 따라 다르다. 요율은 백만분율 정수(3% → 30000)이고, 4대보험에서 내지 않는 항목은 `null`이다.

```json
{ "type": "NONE" }
{ "type": "WITHHOLDING", "businessIncomeTaxPpm": 30000, "localIncomeTaxPpm": 100000 }
{
  "type": "SOCIAL_INSURANCE",
  "nationalPensionPpm": null,
  "healthInsurancePpm": 35950,
  "longTermCarePpm": 131400,
  "employmentInsurancePpm": 9000,
  "earnedIncomeTax": 0
}
```

## 근무

| 메서드 | 경로 | 하는 일 | 응답 |
| --- | --- | --- | --- |
| GET | `/api/shifts?month=2026-11` | 그 달의 근무를 날짜, 시작 시각 순으로 | 200 `{ "shifts": [...] }` |
| POST | `/api/shifts` | 근무를 직접 추가한다 | 201 |
| PUT | `/api/shifts/{workDate}/{id}` | 근무를 통째로 바꾼다. 날짜를 바꾸면 옮긴다 | 200 |
| DELETE | `/api/shifts/{workDate}/{id}?version=3` | 직접 추가한 근무는 지우고, 규칙에서 생긴 근무는 빠진 날로 바꾼다 | 204 또는 200 |

### 시각 입력

시각은 화면에서 입력하는 그대로 `HH:mm`으로 보낸다. 서버가 근무 날짜를 붙여 저장하고, 종료가 시작과 같거나 이르면 다음 날 종료로 본다. 그래서 `22:00`~`02:00`은 밤샘 근무가 되고, 근무는 시작한 날짜에 속한다.

- 시작과 종료가 같거나, 휴게 시간이 근무 시간 이상이면 400이다.
- 실제 시각(`actual`)은 상태가 `WORKED`일 때만 보내고, 그 상태에서는 반드시 보낸다.

### 추가

```json
{
  "workDate": "2026-11-21",
  "kind": "EXTRA",
  "status": "SCHEDULED",
  "planned": { "start": "12:00", "end": "17:00", "breakMin": 0 },
  "actual": null,
  "memo": "대타"
}
```

`kind`(기본 `EXTRA`), `status`(기본 `SCHEDULED`), `actual`, `memo`는 생략할 수 있다. 직접 추가하는 근무는 대타인 경우가 많아서 기본값이 대타·추가 근무다.

### 수정

수정은 전체 교체라서 모든 필드를 보낸다. 생략한 필드가 기본값으로 바뀌어 대타 근무가 계약 근무로 바뀌는 식의 실수를 막기 위해서다. `version`에는 마지막으로 읽은 값을 넣는다.

```json
{
  "version": 1,
  "workDate": "2026-11-13",
  "kind": "REGULAR",
  "status": "WORKED",
  "planned": { "start": "18:00", "end": "23:00", "breakMin": 0 },
  "actual": { "start": "17:00", "end": "23:00", "breakMin": 0 },
  "memo": "한 시간 일찍 출근"
}
```

- 저장된 `version`과 다르면 409 `VERSION_CONFLICT`다. 성공하면 `version`이 1 오른다.
- 반복 규칙에서 생긴 근무를 고치면 `detached`가 `true`가 된다. 이후 규칙을 바꿔도 이 근무는 다시 만들지 않는다.
- 본문의 `workDate`가 경로의 날짜와 다르면 근무를 그 날짜로 옮긴다. 직접 추가한 근무는 같은 `id`로 옮겨지고, 규칙에서 생긴 근무는 원래 날짜에 빠진 날(`CANCELLED`)로 남고 새 날짜에 새 `id`의 근무가 생긴다. 응답은 옮긴 뒤의 근무다.

### 응답 형태

```json
{
  "id": "01JC8Q0Z3R7W2V5N6M4K1H9G0F",
  "workDate": "2026-11-13",
  "ruleId": null,
  "kind": "REGULAR",
  "status": "WORKED",
  "plannedStart": "2026-11-13T18:00",
  "plannedEnd": "2026-11-13T23:00",
  "plannedBreakMin": 0,
  "actualStart": "2026-11-13T17:00",
  "actualEnd": "2026-11-13T23:00",
  "actualBreakMin": 0,
  "detached": false,
  "memo": "한 시간 일찍 출근",
  "version": 2,
  "updatedAt": "2026-11-13T15:02:11.512Z"
}
```
