# AWS에 접속하지 않고 구성을 검사한다. 공급자를 가짜(mock)로 바꿔서 리소스를 만든 것처럼 값을 채운다.
# 실행: terraform -chdir=infra/app init -backend=false && terraform -chdir=infra/app test

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/mock" }
  }
  mock_resource "aws_lambda_function" {
    defaults = { arn = "arn:aws:lambda:ap-northeast-2:111111111111:function:mock" }
  }
  mock_resource "aws_dynamodb_table" {
    defaults = { arn = "arn:aws:dynamodb:ap-northeast-2:111111111111:table/mock" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:ap-northeast-2:111111111111:log-group:mock" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = {
      arn                         = "arn:aws:s3:::albapay-web-mock"
      bucket_regional_domain_name = "albapay-web-mock.s3.ap-northeast-2.amazonaws.com"
    }
  }
  mock_resource "aws_lambda_function_url" {
    defaults = { function_url = "https://abc123.lambda-url.ap-northeast-2.on.aws/" }
  }
  mock_resource "aws_cloudfront_distribution" {
    defaults = {
      arn         = "arn:aws:cloudfront::111111111111:distribution/EXAMPLE"
      domain_name = "d111111abcdef8.cloudfront.net"
    }
  }
}

mock_provider "archive" {}

run "app" {
  command = apply

  assert {
    condition     = aws_dynamodb_table.main.deletion_protection_enabled && aws_dynamodb_table.main.point_in_time_recovery[0].enabled
    error_message = "테이블은 삭제 방지와 시점 복구를 켜야 한다."
  }

  assert {
    condition     = alltrue([for fn in aws_lambda_function.this : fn.runtime == "nodejs24.x" && fn.architectures == tolist(["arm64"])])
    error_message = "Lambda는 nodejs24.x, arm64여야 한다."
  }

  assert {
    condition     = aws_lambda_function_url.api.authorization_type == "AWS_IAM"
    error_message = "Function URL은 서명한 요청만 받아야 한다."
  }

  assert {
    condition = (
      aws_lambda_permission.cloudfront_function_url.action == "lambda:InvokeFunctionUrl" &&
      aws_lambda_permission.cloudfront_invoke.action == "lambda:InvokeFunction" &&
      aws_lambda_permission.cloudfront_function_url.source_arn == aws_cloudfront_distribution.main.arn &&
      aws_lambda_permission.cloudfront_invoke.source_arn == aws_cloudfront_distribution.main.arn
    )
    error_message = "CloudFront 배포 하나에만 두 호출 권한을 모두 줘야 한다."
  }

  assert {
    condition     = one([for o in aws_cloudfront_distribution.main.origin : o.domain_name if o.origin_id == "api"]) == "abc123.lambda-url.ap-northeast-2.on.aws"
    error_message = "API 오리진은 Function URL의 호스트 이름이어야 한다."
  }

  assert {
    condition = (
      aws_cloudfront_distribution.main.ordered_cache_behavior[0].path_pattern == "/api/*" &&
      aws_cloudfront_distribution.main.ordered_cache_behavior[0].target_origin_id == "api" &&
      aws_cloudfront_distribution.main.ordered_cache_behavior[0].cache_policy_id == data.aws_cloudfront_cache_policy.disabled.id
    )
    error_message = "/api/*는 캐시하지 않고 Lambda로 보내야 한다."
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.web.block_public_policy && aws_s3_bucket_public_access_block.web.restrict_public_buckets
    error_message = "웹 버킷은 공개 접근을 막아야 한다."
  }

  assert {
    condition     = aws_scheduler_schedule.materializer.schedule_expression_timezone == "Asia/Seoul"
    error_message = "매일 도는 작업은 서울 시간으로 돌아야 한다."
  }

  assert {
    condition     = output.url == "https://d111111abcdef8.cloudfront.net"
    error_message = "url 출력이 CloudFront 도메인이 아니다."
  }
}
