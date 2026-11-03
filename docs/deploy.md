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
