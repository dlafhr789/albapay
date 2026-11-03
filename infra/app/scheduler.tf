# 매일 새벽 4시(서울)에 반복 규칙의 근무를 하루씩 더 채운다. 이유는 docs/decisions/0001에 있다.

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }

    # 다른 계정의 스케줄이 이 역할을 쓰지 못하게 한다.
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.this["materializer"].arn]
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "${var.name}-scheduler"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}

resource "aws_scheduler_schedule" "materializer" {
  name        = "${var.name}-materializer"
  description = "반복 규칙의 근무를 오늘부터 90일 뒤까지 채운다"

  schedule_expression          = "cron(0 4 * * ? *)"
  schedule_expression_timezone = "Asia/Seoul"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.this["materializer"].arn
    role_arn = aws_iam_role.scheduler.arn

    # 함수를 부르지 못했을 때(권한, 일시적 장애) 다시 시도한다.
    # 함수가 실행 중에 실패하면 Lambda의 비동기 호출 재시도(기본 2회)가 따로 적용된다.
    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 3
    }
  }
}
