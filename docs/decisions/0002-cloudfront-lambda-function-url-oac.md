# 0002. API를 CloudFront와 Lambda Function URL(OAC 서명)로 내보낸다

- 상태: 채택
- 날짜: 2026-11-03

## 상황

API를 쓰는 사람은 한 명이고 요청은 하루에 수십에서 수백 건이다. 웹앱 정적 파일과 API를 같은 도메인에서 내보내면 CORS 설정이 필요 없고, 웹앱이 쿠키나 별도 도메인을 다룰 일도 없다. 정적 파일은 CloudFront와 S3로 내보내기로 했으니 API도 같은 CloudFront 뒤에 두는 것이 자연스럽다.

정해야 할 것은 CloudFront와 Lambda 사이에 무엇을 두느냐다. 조건은 두 가지였다.

- 고정 비용이 0원이어야 한다. 쓰지 않는 달에는 요금이 나오지 않아야 한다.
- CloudFront를 거치지 않고 Lambda를 직접 부를 수 없어야 한다. 보안 헤더와 앞으로 붙일 요청 제한을 우회하지 못하게 하기 위해서다.

## 검토한 선택지

- **A. API Gateway HTTP API**
  - 장점: 경로별 라우팅, 요청 제한(throttling), JWT 인가를 설정으로 할 수 있다.
  - 단점: HTTP API에는 리소스 정책이 없어서 엔드포인트를 CloudFront에서만 부르게 막을 방법이 없다. 비밀 헤더를 CloudFront에서 붙이고 Lambda에서 검사하는 방법이 있지만, 비밀값을 따로 관리하고 교체해야 한다. 라우팅은 이미 Lambda 안의 Hono가 하고 있어서 겹친다.
- **B. Lambda Function URL, 인증 없음(`NONE`)**
  - 장점: 가장 단순하다. 추가 리소스와 요금이 없다.
  - 단점: URL을 알면 누구나 CloudFront를 거치지 않고 부를 수 있다. 앱 토큰이 없으면 401이지만, 함수 호출 자체는 일어난다.
- **C. Lambda Function URL, IAM 인증(`AWS_IAM`) + CloudFront OAC**
  - 장점: Lambda가 서명 없는 요청을 함수 실행 전에 거부한다. 서명할 수 있는 것은 권한을 받은 CloudFront 배포 하나뿐이라, URL이 알려져도 직접 부를 수 없다. 추가 요금이 없다.
  - 단점: OAC가 `Authorization` 헤더를 자기 서명에 쓰므로 앱 토큰을 다른 헤더로 보내야 한다. Lambda는 서명하지 않은 본문을 받지 않아서, 본문이 있는 POST·PUT은 클라이언트가 본문의 SHA-256을 `x-amz-content-sha256` 헤더로 보내야 한다. 요청 제한이 없다.

## 결정

C를 고른다. 직접 호출을 막는 일을 AWS가 서명 검증으로 해 주고, 그 대가인 헤더 두 개는 웹앱의 요청 함수 한 곳에서 처리하면 된다.

- 앱 토큰은 `X-App-Token` 헤더로 보낸다.
- 클라이언트는 POST·PUT 본문의 SHA-256을 계산해서 `x-amz-content-sha256`에 넣는다. 브라우저에서는 Web Crypto(`crypto.subtle.digest`)로 계산한다.
- PATCH는 쓰지 않는다. 수정은 PUT으로 통째로 바꾼다.
- Lambda에는 이 CloudFront 배포에 대해서만 `lambda:InvokeFunctionUrl`과 `lambda:InvokeFunction` 두 권한을 준다. 두 번째 권한은 Function URL을 거친 호출로 한정한다.
- CloudFront는 `/api/*`를 캐시하지 않고, `Host`를 뺀 요청 헤더를 모두 Lambda로 넘긴다. `Host`를 넘기면 Lambda가 자기 도메인이 아닌 요청으로 보고 거부한다.

## 결과

- 요청 제한이 없다. 토큰 없는 요청은 DB를 읽기 전에 401로 끝나지만 함수 실행 요금은 든다. 지금은 월 예산 알림으로 이상한 비용을 알아차리는 데서 그친다.
- 요청 본문은 Function URL 한도인 6MB를 넘을 수 없다. 이 앱의 요청은 수 KB다.
- 응답 스트리밍은 쓰지 않는다(`BUFFERED`).
- 여러 사람이 쓰게 되거나 요청 제한이 필요해지면 AWS WAF의 요청 빈도 규칙을 CloudFront에 붙이거나 A를 다시 검토한다.
