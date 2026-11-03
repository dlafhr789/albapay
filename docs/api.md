# API

모든 요청은 CloudFront 도메인의 `/api/*`로 보내고 JSON으로 주고받는다. 요청·응답 스키마는 [`packages/shared/src/api.ts`](../packages/shared/src/api.ts)에 있고 웹과 Lambda가 같은 정의를 쓴다. 응답에는 `Cache-Control: no-store`가 붙는다.

## 인증

모든 요청에 `X-App-Token` 헤더로 토큰을 보낸다.

- `Authorization` 헤더는 쓰지 않는다. CloudFront OAC가 Lambda Function URL로 보내는 요청에 자기 서명을 이 헤더로 넣기 때문이다.
- 서버는 토큰의 SHA-256 해시만 저장하고, 받은 토큰의 해시와 상수 시간으로 비교한다.
- 토큰이 없거나 틀리면 경로가 있든 없든 `401`을 돌려준다. 토큰 없이는 어떤 경로가 있는지도 알 수 없다.
- 본문이 있는 POST·PUT 요청은 본문의 SHA-256(16진수)을 `x-amz-content-sha256` 헤더에 넣는다. CloudFront가 Lambda로 넘기는 요청에 본문까지 서명하는데, Lambda는 서명하지 않은 본문을 받지 않기 때문이다. 헤더가 없거나 값이 틀리면 Lambda에 닿기 전에 `403`이 오고, 본문은 위의 오류 형식이 아니다.
- PATCH는 쓰지 않는다. 수정은 PUT으로 통째로 바꾼다.

이렇게 정한 이유는 [ADR 0002](decisions/0002-cloudfront-lambda-function-url-oac.md)에 있다.

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
| 409 | `PERIOD_LOCKED` | 확정한 정산 기간의 근무를 바꾸려 하거나, 반복 규칙이 그 기간과 겹침. 확정을 먼저 해제해야 한다 |
| 409 | `PERIOD_NOT_ENDED` | 아직 끝나지 않은 정산 기간을 확정하려 함 |
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

## 반복 규칙

반복 규칙은 요일별 근무 시각과 기간을 정해 두면 그 기간의 근무를 날짜별로 만들어 준다. 만든 근무는 직접 추가한 근무와 같은 형태라서 하루씩 따로 고칠 수 있다. 펼쳐 저장하는 이유는 [ADR 0001](decisions/0001-materialize-recurring-shifts.md)에 있다.

| 메서드 | 경로 | 하는 일 | 응답 |
| --- | --- | --- | --- |
| GET | `/api/rules` | 규칙 목록을 시작일 순으로 | 200 `{ "rules": [...] }` |
| POST | `/api/rules` | 규칙을 만들고 근무를 펼친다 | 201 |
| POST | `/api/rules/{id}/split` | 이 날짜부터 다른 규칙으로 바꾼다 | 201 `{ "previous": ..., "next": ... }` |
| POST | `/api/rules/{id}/end` | 이 날짜부터 규칙을 끝낸다 | 200 `{ "rule": ... }` |

### 만들기

```json
{
  "slots": [
    { "dayOfWeek": 3, "start": "18:00", "end": "23:00", "breakMin": 0 },
    { "dayOfWeek": 5, "start": "22:00", "end": "06:00", "breakMin": 60 }
  ],
  "startDate": "2026-11-04",
  "endDate": null,
  "intervalWeeks": 1
}
```

- `dayOfWeek`는 0이 일요일, 6이 토요일이다. 시각은 근무 입력과 같은 규칙으로 검사한다.
- 규칙 하나에 같은 요일은 한 번만 넣는다. 하루에 두 번 일하는 날은 하나를 직접 추가한다.
- `endDate`는 마지막 근무 날짜이고, `null`이면 끝이 없다.
- `intervalWeeks`가 2면 격주다. 시작일이 속한 주를 첫 근무 주로 세고, 주는 월요일부터 센다. 토요일에 시작하는 격주 주말 규칙은 그 토·일과 2주 뒤 토·일에 근무가 생긴다.
- 시작일부터 종료일까지가 확정한 정산 기간과 겹치면 409 `PERIOD_LOCKED`다. 지난 날짜도 확정하지 않은 기간이면 시작일로 쓸 수 있다.

저장하면 바로 오늘부터 90일 뒤까지(종료일이 더 이르면 종료일까지) 근무를 만든다. 그 뒤는 매일 새벽 4시(서울)에 도는 작업이 하루씩 채운다. 시작일이 90일보다 뒤면 그날이 가까워질 때 만든다.

- 만든 근무의 `id`는 `r_<규칙 id>_<YYYYMMDD>`, `ruleId`는 규칙 `id`, `kind`는 `REGULAR`(계약 근무)다.
- 이미 같은 `id`의 근무가 있으면 덮어쓰지 않는다. 사용자가 고친 근무는 펼치기를 다시 돌려도 그대로 남는다.
- 확정한 정산 기간의 날짜에는 근무를 만들지 않는다.

### 바꾸기와 끝내기

규칙은 고쳐 쓰지 않고 날짜 하나를 기준으로 나눈다. 그 날짜 전의 근무는 기존 규칙에 그대로 남아서, 지난 근무 기록이 규칙 수정 때문에 바뀌지 않는다.

```json
POST /api/rules/{id}/split
{
  "version": 1,
  "fromDate": "2026-11-30",
  "slots": [
    { "dayOfWeek": 6, "start": "12:00", "end": "18:00", "breakMin": 0 },
    { "dayOfWeek": 0, "start": "12:00", "end": "18:00", "breakMin": 0 }
  ],
  "endDate": null,
  "intervalWeeks": 1
}

POST /api/rules/{id}/end
{ "version": 1, "fromDate": "2026-12-01" }
```

- `fromDate`는 바뀐 일정(또는 근무 없음)이 시작되는 첫날이다. 기존 규칙의 종료일은 그 전날이 된다.
- 기존 규칙에서 `fromDate` 이후에 만든 근무는 지운다. 단, 따로 고친 근무(`detached`, 빠진 날 포함)는 남긴다.
- 나누기로 만든 새 규칙은 그렇게 남은 근무의 날짜를 `skipDates`에 넣어서 같은 날 근무를 하나 더 만들지 않는다.
- `fromDate`가 기존 규칙의 시작일 이전이면 기존 규칙은 근무가 하나도 없게 되어 지워진다. 이때 `previous`(끝내기는 `rule`)가 `null`이다.
- 기존 규칙이 이미 끝난 뒤의 날짜면 400이다. 그 뒤의 일정은 새 규칙으로 만든다.
- `fromDate` 이후가 확정한 정산 기간과 겹치면 409 `PERIOD_LOCKED`다. 확정하지 않은 기간이면 지난 날짜부터도 바꿀 수 있다.
- 나누기는 기존 규칙을 고치는 쓰기와 새 규칙을 만드는 쓰기를 트랜잭션 하나로 묶는다.

### 응답 형태

```json
{
  "id": "01JC8Q4K2D9F7T3B5X1W6N8M0P",
  "slots": [
    { "dayOfWeek": 3, "start": "18:00", "end": "23:00", "breakMin": 0 },
    { "dayOfWeek": 5, "start": "22:00", "end": "06:00", "breakMin": 60 }
  ],
  "startDate": "2026-11-04",
  "endDate": null,
  "intervalWeeks": 1,
  "skipDates": [],
  "materializedThrough": "2027-01-31",
  "version": 1,
  "createdAt": "2026-11-02T03:00:00.000Z",
  "updatedAt": "2026-11-02T03:00:00.000Z"
}
```

- `materializedThrough`는 근무를 어디까지 만들었는지다. 아직 하나도 만들지 않았으면 `null`이다.
- `skipDates`는 근무를 만들지 않는 날짜다. 규칙을 나눌 때 채워진다.
- `version`은 바꾸기·끝내기를 할 때 마지막으로 읽은 값을 보낸다. 근무를 채우는 작업은 `version`을 올리지 않는다.

## 정산

| 메서드 | 경로 | 하는 일 | 응답 |
| --- | --- | --- | --- |
| GET | `/api/payroll?period=2026-11` | 그 달에 시작하는 정산 기간의 결과. 확정한 기간이면 확정할 때의 결과 | 200 |
| POST | `/api/payroll/{period}/lock` | 정산을 확정한다 | 201, 이미 확정했으면 200 |
| DELETE | `/api/payroll/{period}/lock` | 확정을 해제한다 | 204, 없으면 404 |

- `period`는 정산 기간이 시작하는 달이다. 정산 시작일이 25일이면 `2026-11`은 11월 25일부터 12월 24일까지다.
- 화면이 금액을 다시 계산하지 않도록 판정 근거가 되는 중간값까지 모두 내려준다.
- 정산은 기간이 끝난 다음 날(서울 기준)부터 확정할 수 있다.
- 확정하면 그때의 계산 결과를 그대로 저장하고, 이후 조회에서는 다시 계산하지 않는다. 시급이나 요율을 나중에 고쳐도 지난 급여 기록이 바뀌지 않게 하기 위해서다.
- 확정한 기간에 속한 날짜로는 근무를 추가, 수정, 이동, 삭제할 수 없다. 고치려면 확정을 해제한 뒤 고친다.

응답 예시다. `weeklyHoliday`는 기간에 속한 다섯 주 중 첫 주만 적었다.

```json
{
  "period": { "start": "2026-11-01", "end": "2026-11-30" },
  "base": {
    "confirmedMinutes": 2160,
    "confirmedPay": 371520,
    "expectedMinutes": 2100,
    "expectedPay": 361200,
    "totalMinutes": 4260,
    "totalPay": 732720
  },
  "weeklyHoliday": [
    {
      "weekStart": "2026-10-26",
      "weekEnd": "2026-11-01",
      "contractMinutes": 900,
      "averageContractMinutes": 900,
      "averagedWeeks": 4,
      "attended": true,
      "eligible": true,
      "holidayMinutes": 180,
      "amount": 30960,
      "final": true,
      "actualMinutes": 900,
      "averageActualMinutes": 900
    }
  ],
  "weeklyHolidayTotal": 154800,
  "gross": 887520,
  "deductions": [
    { "item": "BUSINESS_INCOME_TAX", "amount": 26620 },
    { "item": "LOCAL_INCOME_TAX", "amount": 2660 }
  ],
  "deductionTotal": 29280,
  "net": 858240,
  "warnings": [],
  "locked": false,
  "lockedAt": null
}
```

계산 규칙은 [payroll-rules.md](payroll-rules.md)에 있다.
