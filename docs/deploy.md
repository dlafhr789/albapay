# 배포

AWS 계정 하나에 Terraform으로 배포한다. 구성은 둘로 나뉜다.

| 폴더 | 만드는 것 | 상태 파일 |
| --- | --- | --- |
| `infra/bootstrap` | Terraform 상태를 담는 S3 버킷 | 로컬 `terraform.tfstate` |
| `infra/app` | 앱이 쓰는 모든 리소스 | 위 버킷 |

상태 버킷을 따로 만드는 이유는 `infra/app`의 상태를 저장할 곳이 `infra/app`보다 먼저 있어야 하기 때문이다. `infra/bootstrap`은 버킷 하나만 관리해서 상태 파일을 잃어도 `terraform import`로 다시 가져올 수 있다.

## 준비

- Terraform 1.10 이상. S3 백엔드의 `use_lockfile`(DynamoDB 테이블 없이 상태 잠금)이 1.10부터 있다.
- AWS CLI 2.32 이상. 아래의 `aws login`이 2.32부터 있다.
- 2025년 7월 15일 이후에 만든 계정이 무료 플랜(Free plan)이면 6개월이 지나거나 크레딧을 다 쓰면 계정이 닫힌다. 계속 쓸 앱이라 유료 플랜(Paid plan)으로 바꿔 둔다. 유료 플랜에서도 상시 무료 한도는 그대로 적용된다.

아래 명령 블록은 그대로 붙여 넣어도 되게 명령 줄에 주석을 달지 않았다. macOS 기본 셸인 zsh는 대화형으로 입력한 명령의 `#`을 주석으로 보지 않는다.

### 배포용 IAM 사용자

루트 계정 자격 증명은 CLI에 등록하지 않는다. 배포만 하는 IAM 사용자를 따로 만든다.

1. IAM 콘솔에서 사용자를 만들고 콘솔 접근을 켠다. `aws login`이 콘솔 로그인을 쓰기 때문이다. MFA를 등록하고, 액세스 키는 만들지 않는다.
2. AWS 관리형 정책 두 개를 붙인다.
   - `PowerUserAccess`: IAM과 Organizations를 뺀 모든 서비스
   - `SignInLocalDevelopmentAccess`: `aws login`
3. [`infra/deployer-policy.json`](../infra/deployer-policy.json)을 인라인 정책으로 붙인다. Terraform이 Lambda와 Scheduler의 IAM 역할을 만들어야 해서, 이름이 `albapay-`로 시작하는 역할만 만들고 고칠 수 있게 한다. 이 사용자는 다른 사용자를 만들거나 자기 권한을 늘릴 수 없다.

### CLI 로그인

`aws login`은 브라우저로 콘솔에 로그인해서 짧은 수명의 자격 증명을 받는다. 자격 증명은 15분마다 새로 받고 세션은 최대 12시간이라, 오래 사는 액세스 키가 파일에 남지 않는다.

```bash
brew install hashicorp/tap/terraform
aws login --profile albapay-signin
```

Terraform 같은 도구는 이 로그인 방식을 아직 직접 읽지 못할 수 있다. 그래서 CLI가 자격 증명을 꺼내 넘겨주는 프로필을 `~/.aws/config`에 하나 더 둔다.

```ini
[profile albapay]
credential_process = aws configure export-credentials --profile albapay-signin --format process
region = ap-northeast-2
```

새 터미널마다 프로필을 지정하고, 배포용 사용자로 들어왔는지 확인한다. 세션이 끝나면 `aws login --profile albapay-signin`만 다시 하면 된다.

```bash
export AWS_PROFILE=albapay
aws sts get-caller-identity
```

## 1. 상태 버킷

처음 한 번만 한다.

```bash
cd infra/bootstrap
terraform init
terraform apply
terraform output -raw state_bucket
```

버킷 이름은 `albapay-tfstate-` 뒤에 난수가 붙는다. 계정 ID를 이름에 넣지 않기 위해서다. 버킷은 다음과 같이 만든다.

- 버전 관리를 켜서 덮어쓴 상태 파일을 90일 동안 되돌릴 수 있다.
- 공개 접근을 모두 막고, HTTPS가 아닌 요청은 버킷 정책으로 거부한다.
- `prevent_destroy`가 걸려 있어서 `terraform destroy`로 지워지지 않는다.

`infra/bootstrap/terraform.tfstate`는 `.gitignore`에 들어 있다. 커밋하지 않는다.

`terraform init`이 만드는 `.terraform.lock.hcl`은 커밋한다. 공급자 버전과 해시를 고정해서, 다른 컴퓨터나 CI에서도 같은 공급자를 받는다.

## 2. 앱 리소스

Lambda 묶음을 빌드한다. Terraform이 이 결과를 압축해서 올린다.

```bash
pnpm install
pnpm --filter @albapay/api build
```

커밋하지 않는 설정 파일 두 개를 만든다. `backend.hcl`에는 1단계의 상태 버킷 이름이 들어가고, `terraform.tfvars`에는 예산 알림을 받을 이메일을 넣는다.

```bash
cd infra/app
printf 'bucket = "%s"\nregion = "ap-northeast-2"\n' "$(terraform -chdir=../bootstrap output -raw state_bucket)" > backend.hcl
cp terraform.tfvars.example terraform.tfvars
open -e terraform.tfvars
```

계획을 파일로 저장한 뒤 그 계획 그대로 적용한다. `Plan:` 줄에서 `to destroy`가 0인지 보고 진행한다. 계획 파일(`*.tfplan`)은 `.gitignore`에 들어 있다.

```bash
terraform init -backend-config=backend.hcl
terraform plan -out=app.tfplan
terraform apply app.tfplan
```

구성 전체와 요청 흐름은 [architecture.md](architecture.md)에 있다.

코드를 바꾼 뒤에는 빌드하고 `terraform apply`만 다시 하면 된다. 묶음의 해시가 바뀐 함수만 새로 올라간다.

| 리소스 | 설정 | 이유 |
| --- | --- | --- |
| DynamoDB 테이블 | 프로비저닝 읽기·쓰기 각 10, 시점 복구, 삭제 방지 | 상시 무료 한도(각 25) 안에서 고정 비용 0원. 실수로 지우거나 덮어쓴 데이터를 35일 안으로 되돌릴 수 있다 |
| Lambda `api` | Node.js 24, arm64, 512MB, 10초 | 웹앱 API. 메모리를 늘리면 CPU도 늘어서 콜드 스타트가 짧아진다 |
| Lambda `materializer` | Node.js 24, arm64, 256MB, 120초 | 반복 규칙의 근무를 채운다. 규칙을 처음 펼칠 때 근무 수십 건을 차례로 쓴다 |
| 로그 그룹 | 30일 보관 | 함수가 처음 로그를 쓸 때 자동으로 생기는 로그 그룹은 보관 기간이 무제한이다 |
| EventBridge Scheduler | 매일 04:00 Asia/Seoul | 서울 시간대로 지정해서 UTC 변환을 하지 않는다 |
| CloudFront | `/api/*`는 Lambda, 그 외는 S3 | 웹앱과 API를 한 도메인으로 내보낸다. 처음 만들거나 바꾸면 전 세계 엣지에 퍼지는 데 몇 분 걸린다 |
| CloudFront 함수 | S3 쪽 요청에서 확장자 없는 경로를 `/index.html`로 | 화면 주소(`/payroll`)에서 새로 고쳐도 같은 화면이 열린다 |
| S3 웹 버킷 | 공개 접근 차단 | 이 CloudFront 배포만 읽을 수 있다 |

함수마다 IAM 역할을 따로 두고, 테이블 하나와 자기 로그 그룹에만 권한을 준다.

### 예산 알림

`terraform.tfvars`에 `alert_email`을 넣으면 AWS Budgets 월 예산(기본 5달러)을 만든다. 이번 달 예상 비용이 80%를 넘을 것 같을 때와 실제 비용이 예산을 넘었을 때 메일이 온다.

- 평소 요금이 상시 무료 한도 안이라서, 요금이 나오기 시작하면 설정 실수나 비정상 호출일 가능성이 높다.
- 비용 할당 태그를 켜지 않아도 되게 계정 전체 비용을 본다. 같은 계정에 다른 서비스가 있으면 `monthly_budget_usd`를 그만큼 올린다.
- 이메일 주소는 `terraform.tfvars`에만 두고 커밋하지 않는다.

## 3. 토큰 발급

웹앱과 API가 쓰는 토큰을 발급한다. 서버에는 SHA-256 해시만 저장되고 원본은 이때 한 번만 화면에 나온다. 비밀번호 관리자 같은 곳에 바로 저장한다. 저장소 루트에서 실행한다.

```bash
TABLE_NAME=$(terraform -chdir=infra/app output -raw table_name) \
  pnpm --filter @albapay/api issue-token api
```

다시 발급하면 저장된 해시가 바뀌어서 이전 토큰은 바로 쓸 수 없다.

## 4. 확인

웹앱이 아직 없어도 터미널에서 API를 부를 수 있다. 호출 스크립트(`packages/api/scripts/call.ts`)가 토큰 헤더와 본문 해시 헤더를 붙여 준다. 토큰은 셸 기록에 남지 않게 `read -s`로 입력받는다. `read` 줄에서는 화면에 아무것도 보이지 않는 채로 토큰을 붙여 넣고 엔터를 친다.

```bash
export ALBAPAY_URL=$(terraform -chdir=infra/app output -raw url)
read -rs ALBAPAY_TOKEN
export ALBAPAY_TOKEN
pnpm --filter @albapay/api call GET /api/config
```

`200 OK`와 `{ "settings": null, "wages": [], "deductions": [] }`가 나오면 CloudFront, Function URL, Lambda, DynamoDB가 모두 이어진 것이다. 웹앱은 아직 올리지 않아서 브라우저로 `/`를 열면 403(AccessDenied)이 정상이다. 본문이 있는 요청은 이렇게 보낸다.

```bash
pnpm --filter @albapay/api call PUT /api/config/wages/2026-01-01 '{"hourlyWage":10320}'
```

CloudFront를 거치지 않으면 막히는지도 확인한다. Function URL로 직접 보내면 서명이 없어서 `403`이 나와야 한다.

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "$(aws lambda get-function-url-config --function-name albapay-api --query FunctionUrl --output text)api/config"
```

## 5. 웹앱 올리기

웹앱을 빌드해서 S3 웹 버킷에 올리고 CloudFront 캐시를 비운다. 버킷 이름과 배포 ID는 Terraform 출력에서 읽는다. 저장소 루트에서 실행한다.

```bash
pnpm --filter @albapay/web upload
```

스크립트(`packages/web/scripts/upload.sh`)는 이 순서로 올린다.

1. 이름에 해시가 붙은 파일(`assets/`)을 `max-age=31536000, immutable`로 올린다. 내용이 바뀌면 이름도 바뀌어서 오래 캐시해도 된다.
2. 이름이 고정된 파일(`index.html`, `sw.js`, 매니페스트, 아이콘)을 `no-cache`로 올린다. 브라우저가 매번 새 버전이 있는지 확인한다.
3. 더는 쓰지 않는 해시 파일을 지운다. 새 `index.html`이 올라간 뒤에 지워야 그사이 연 화면이 깨지지 않는다.
4. CloudFront 캐시를 `/*` 하나로 비운다. 경로 하나로 세어서 월 무료 횟수(1,000개) 안이다.

### 아이폰에 설치

1. 사파리에서 `terraform -chdir=infra/app output -raw url` 주소를 연다.
2. 공유 버튼 → **홈 화면에 추가**를 누른다.
3. 홈 화면의 알바페이를 열고 3단계에서 발급한 토큰을 넣는다. 사파리와 홈 화면 앱은 저장소가 따로라서, 사파리에서 넣은 토큰은 앱에서 보이지 않는다.

## 6. 캘린더 구독

근무 일정을 아이폰 캘린더에 보이게 한다. 피드가 어떻게 만들어지는지는 [API 문서](api.md#캘린더-구독)에, 주소에 토큰을 넣는 이유는 [ADR 0004](decisions/0004-calendar-feed-token-in-url.md)에 있다.

1. 알바페이 → **설정** → **캘린더 구독** → **구독 주소 만들기**를 누른다. 주소는 이때 한 번만 보인다.
2. **캘린더에 추가**를 누르고 구독 창에서 **구독**을 누른다.
   - 구독 창이 뜨지 않으면 **주소 복사**를 누른 뒤, 설정 앱 → **앱** → **캘린더** → **캘린더 계정** → **계정 추가** → **기타** → **구독 캘린더 추가**에서 서버 칸에 붙여 넣는다.
3. 같은 **캘린더 계정** 화면의 **새로운 데이터 가져오기**(Fetch New Data)를 **매시간**으로 둔다. 캘린더가 피드를 다시 받아 가는 간격이 이 설정을 따른다.

주소를 다른 사람에게 보여 줬거나 잃어버렸으면 **주소 새로 만들기**를 누른다. 이전 주소는 바로 끊기므로 캘린더의 이전 구독을 지우고 새 주소를 다시 추가한다.

터미널에서 피드를 확인할 수도 있다. 주소가 셸 기록에 남지 않게 `read -s`로 입력받는다.

```bash
read -rs ALBAPAY_FEED_URL
curl -s -D - -o /dev/null "$ALBAPAY_FEED_URL"
```

`200`과 `content-type: text/calendar; charset=utf-8`이 나오면 된다. 주소의 토큰을 한 글자만 바꿔도 `404`가 나와야 한다.

## 구성 검사

`infra/app/tests`의 테스트는 AWS 공급자를 가짜로 바꿔서 계정 없이 돈다. Function URL 인증 방식, CloudFront 권한, `/api/*`·`/cal/*` 캐시 정책 같은 보안 설정이 바뀌면 실패한다.

```bash
terraform -chdir=infra/app init -backend=false
terraform -chdir=infra/app test
terraform fmt -check -recursive infra
```
