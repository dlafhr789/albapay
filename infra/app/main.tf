data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id

  # pnpm --filter @albapay/api build가 만든 함수별 폴더
  lambda_dist = "${path.module}/../../packages/api/dist"
}
