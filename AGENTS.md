# AGENTS.md

이 저장소에서 일하는 코딩 에이전트(Claude Code, Codex 등)를 위한 작업 지침이다. 사람용 소개는 `README.md`에 있다.

## 프로젝트

알바페이(가칭)는 한 사람이 쓰는 아르바이트 급여 계산 웹앱이다.

- 근무를 기록하면 기본급, 주휴수당, 공제를 계산한다.
- 근무 일정을 iCalendar(.ics) 구독 URL로 내보내서 애플 캘린더에 표시한다.
- 앱스토어 서명 없이 쓰기 위해 네이티브 앱이 아니라 PWA로 만든다.
- AWS 서버리스(CloudFront, S3, Lambda Function URL, DynamoDB, EventBridge Scheduler)에 Terraform으로 배포한다.
- 공개 저장소이고 포트폴리오로도 쓰인다.

## 먼저 읽을 것

1. `docs/conventions.md`: 커밋, 문서, 변경 기록 규칙
2. `CHANGELOG.md`의 `진행 중`과 최신 날짜 항목: 어디까지 했는지
3. `docs/decisions/`: 설계 결정과 그 이유 (만들어지는 대로)
4. `.private/context.md`: 있을 때만. 커밋하지 않는 개인 맥락과 비공개 작업 문서 링크가 있다. 내용을 공개 파일로 옮기지 않는다.

## 저장소 구조

pnpm 모노레포로 만든다. 아직 없는 폴더는 처음 필요할 때 만든다.

```
packages/shared   급여 계산 엔진(DB에 의존하지 않는 순수 함수), zod 스키마
packages/api      Lambda 핸들러
packages/web      React + TypeScript + Vite PWA
infra             Terraform
docs              공개 문서
```

## 명령

```
pnpm install
pnpm typecheck
pnpm test             # 단위 테스트. DB 없이 돈다
docker compose up -d  # DynamoDB Local (localhost:8000)
pnpm test:int         # 통합 테스트. DYNAMODB_ENDPOINT로 다른 엔드포인트를 쓸 수 있다
```

Docker 이미지를 받을 수 없는 환경에서는 `pip install "moto[server]"`로 설치한 뒤 `moto_server -p 8000`을 띄우면 통합 테스트를 대신 돌릴 수 있다. moto와 DynamoDB Local은 동작이 조금씩 다를 수 있으니, PR을 병합하기 전에 DynamoDB Local에서도 통합 테스트를 돌린다.

## 도메인 규칙

바꾸려면 먼저 ADR을 쓴다.

- 시간대는 Asia/Seoul 고정이다. Lambda는 UTC로 돌기 때문에, 서버에서 오늘 날짜는 반드시 서울 기준으로 바꾸는 공용 함수 하나로만 구한다.
- 시각은 오프셋 없는 로컬 문자열(`2026-11-03T22:00`)로 저장하고 항상 서울 시각으로 해석한다. 밤샘 근무는 시작한 날짜(workDate)에 귀속된다.
- 금액은 원 단위 정수, 시간은 분 단위 정수, 요율은 백만분율 정수(4.75% → 47500)다. 부동소수점을 쓰지 않는다. 나눗셈은 마지막에 한 번만 하고 원 미만은 버린다.
- 시급과 공제 요율은 덮어쓰지 않고 적용 시작일별 이력으로 쌓는다.
- 반복 규칙은 요일별 시각 목록(slots)과 시작일·종료일을 가진다. 저장할 때 날짜별 근무로 펼친다.
- 규칙에서 생긴 근무의 ID는 `r_<ruleId>_<YYYYMMDD>`로 결정적이다. 같은 펼치기를 여러 번 해도 중복이 생기지 않는다.
- 규칙에서 생긴 근무는 삭제하지 않고 `CANCELLED`로 바꾼다. 지우면 매일 도는 펼치기 작업이 같은 ID로 다시 만든다.
- 주휴수당은 계약 근무(`REGULAR`)의 예정 시간으로만 판정한다. 대타(`EXTRA`)와 실제 연장분은 넣지 않는다.
  - 요건: 그 주를 포함한 직전 4주의 계약 근무 평균이 900분 이상이고, 그 주에 결근(`ABSENT`)이 없을 것
  - 금액: `floor(min(계약 근무 분, 2400) × 시급 ÷ 300)`
  - 귀속: 주의 마지막 날이 속한 정산 기간
- 상시 5인 미만 사업장이 전제다. 야간·연장·휴일 가산수당은 계산하지 않는다.
- 정산은 기간이 끝난 뒤에만 확정할 수 있다. 확정한 기간에 속한 날짜로는 근무를 추가·수정·이동·삭제할 수 없고 API가 409로 거부한다.

## 인프라·보안 규칙

- Lambda Function URL은 인증 방식이 AWS_IAM이고 CloudFront OAC가 서명한 요청만 받는다.
  - 그래서 앱 토큰은 `Authorization`이 아니라 `X-App-Token` 헤더로 보낸다. OAC가 `Authorization` 헤더를 자기 서명으로 쓰기 때문이다.
  - 본문이 있는 POST·PUT 요청은 클라이언트가 본문의 SHA-256을 `x-amz-content-sha256` 헤더에 넣는다. PATCH는 쓰지 않는다.
- 토큰은 서버에 SHA-256 해시로만 저장한다. 원본 토큰과 캘린더 구독 URL은 로그에 남기지 않는다.
- 외부 스크립트(광고, 분석 도구)를 넣지 않는다. CSP는 `default-src 'self'`가 기준이다.

## 공개 저장소 규칙

반드시 지킨다.

- 실제 근무 기록, 실제 급여 금액, 사용자의 보험 가입 상태 같은 개인 정보를 커밋하지 않는다. 테스트와 문서 예시는 가상 데이터만 쓴다.
- `.env*`, `*.tfstate*`, `*.tfvars`, 토큰, 캘린더 구독 URL, AWS 계정 ID를 커밋하지 않는다.
- `.private/`와 `CLAUDE.local.md`는 커밋하지 않는다.
- 커밋 전 훅(`.githooks/pre-commit`)을 끄거나 `--no-verify`로 건너뛰지 않는다.

## 작업 방식

- 문서, 커밋 메시지, 코드 주석은 한국어로 쓴다. 식별자와 테스트 이름은 영어로 쓴다. 소정근로, 주휴수당 같은 급여·노동법 용어는 영어로 옮기면 뜻이 흐려지기 때문이다.
- 계산 로직은 테스트를 먼저 쓴다. `docs/payroll-rules.md`의 테스트 케이스가 기준이다.
- 커밋 하나에 논리적 변경 하나만 넣는다. 모든 커밋에서 빌드와 테스트가 통과해야 한다.
- 동작이나 설계가 바뀌면 같은 커밋에서 `CHANGELOG.md`와 관련 문서를 함께 고친다.
- 작업을 시작하면 `CHANGELOG.md`의 `진행 중`에 적고, 끝나면 날짜 항목으로 옮긴다.
- 설계 결정이 바뀌면 기존 ADR을 고치지 않는다. 새 ADR을 쓰고 기존 ADR의 상태를 `대체됨`으로 바꾼다.
- 세부 규칙은 `docs/conventions.md`에 있다.
