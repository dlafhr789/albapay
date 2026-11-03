# 배포

AWS 계정 하나에 Terraform으로 배포한다. 구성은 둘로 나뉜다.

| 폴더 | 만드는 것 | 상태 파일 |
| --- | --- | --- |
| `infra/bootstrap` | Terraform 상태를 담는 S3 버킷 | 로컬 `terraform.tfstate` |
| `infra/app` | 앱이 쓰는 모든 리소스 | 위 버킷 |

상태 버킷을 따로 만드는 이유는 `infra/app`의 상태를 저장할 곳이 `infra/app`보다 먼저 있어야 하기 때문이다. `infra/bootstrap`은 버킷 하나만 관리해서 상태 파일을 잃어도 `terraform import`로 다시 가져올 수 있다.

## 준비

- Terraform 1.10 이상. S3 백엔드의 `use_lockfile`(DynamoDB 테이블 없이 상태 잠금)이 1.10부터 있다.
- AWS CLI와, 리소스를 만들 권한이 있는 자격 증명. `aws sts get-caller-identity`가 계정 정보를 보여 주면 된다.
- 2025년 7월 15일 이후에 만든 계정이 무료 플랜(Free plan)이면 6개월이 지나거나 크레딧을 다 쓰면 계정이 닫힌다. 계속 쓸 앱이라 유료 플랜(Paid plan)으로 바꿔 둔다. 유료 플랜에서도 상시 무료 한도는 그대로 적용된다.

```bash
brew install hashicorp/tap/terraform
aws configure sso   # 또는 aws configure
export AWS_PROFILE=<프로필 이름>
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

## 2. 앱 리소스

```bash
pnpm install
pnpm --filter @albapay/api build      # Lambda 묶음. Terraform이 이 결과를 압축해서 올린다

cd infra/app
cp backend.hcl.example backend.hcl    # bucket에 1단계의 state_bucket을 넣는다
cp terraform.tfvars.example terraform.tfvars   # 예산 알림을 받을 이메일
terraform init -backend-config=backend.hcl
terraform plan -out=app.tfplan       # *.tfplan은 .gitignore에 들어 있다
terraform apply app.tfplan
```

코드를 바꾼 뒤에는 빌드하고 `terraform apply`만 다시 하면 된다. 묶음의 해시가 바뀐 함수만 새로 올라간다.

| 리소스 | 설정 | 이유 |
| --- | --- | --- |
| DynamoDB 테이블 | 프로비저닝 읽기·쓰기 각 10, 시점 복구, 삭제 방지 | 상시 무료 한도(각 25) 안에서 고정 비용 0원. 실수로 지우거나 덮어쓴 데이터를 35일 안으로 되돌릴 수 있다 |
| Lambda `api` | Node.js 24, arm64, 512MB, 10초 | 웹앱 API. 메모리를 늘리면 CPU도 늘어서 콜드 스타트가 짧아진다 |
| Lambda `materializer` | Node.js 24, arm64, 256MB, 120초 | 반복 규칙의 근무를 채운다. 규칙을 처음 펼칠 때 근무 수십 건을 차례로 쓴다 |
| 로그 그룹 | 30일 보관 | 함수가 처음 로그를 쓸 때 자동으로 생기는 로그 그룹은 보관 기간이 무제한이다 |
| EventBridge Scheduler | 매일 04:00 Asia/Seoul | 서울 시간대로 지정해서 UTC 변환을 하지 않는다 |

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
