# Lambda 함수 두 개: 웹앱의 API와 매일 새벽 근무를 채우는 작업.
# 코드는 packages/api/dist에 미리 빌드해 둬야 한다(pnpm --filter @albapay/api build).

locals {
  lambdas = {
    api = {
      description = "웹앱 API. CloudFront를 거친 요청만 받는다"
      memory_size = 512
      timeout     = 10
    }
    materializer = {
      description = "반복 규칙의 근무를 90일 앞까지 채운다. 매일 새벽 4시(서울)에 돈다"
      memory_size = 256
      timeout     = 120
    }
  }

  # 함수마다 허용하는 DynamoDB 작업. 트랜잭션 쓰기는 별도 권한 없이 안에 든 작업의 권한으로 검사한다.
  dynamodb_actions = {
    api = [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:ConditionCheckItem",
    ]
    materializer = [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
    ]
  }
}

data "archive_file" "lambda" {
  for_each = local.lambdas

  type        = "zip"
  source_dir  = "${local.lambda_dist}/${each.key}"
  output_path = "${path.module}/.build/${each.key}.zip"
}

# 함수가 처음 로그를 쓸 때 자동으로 생기는 로그 그룹은 보관 기간이 무제한이라, 미리 만들어 둔다.
resource "aws_cloudwatch_log_group" "lambda" {
  for_each = local.lambdas

  name              = "/aws/lambda/${var.name}-${each.key}"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  for_each = local.lambdas

  name               = "${var.name}-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "lambda" {
  for_each = local.lambdas

  statement {
    sid       = "Table"
    actions   = local.dynamodb_actions[each.key]
    resources = [aws_dynamodb_table.main.arn]
  }

  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.lambda[each.key].arn}:*"]
  }
}

resource "aws_iam_role_policy" "lambda" {
  for_each = local.lambdas

  name   = "${var.name}-${each.key}"
  role   = aws_iam_role.lambda[each.key].id
  policy = data.aws_iam_policy_document.lambda[each.key].json
}

resource "aws_lambda_function" "this" {
  for_each = local.lambdas

  function_name = "${var.name}-${each.key}"
  description   = each.value.description
  role          = aws_iam_role.lambda[each.key].arn

  # nodejs22.x는 2027-04-30에 지원이 끝나서 nodejs24.x를 쓴다. 묶음은 Node 22 문법으로 빌드해서 둘 다에서 돈다.
  runtime       = "nodejs24.x"
  architectures = ["arm64"]
  handler       = "index.handler"
  memory_size   = each.value.memory_size
  timeout       = each.value.timeout

  filename         = data.archive_file.lambda[each.key].output_path
  source_code_hash = data.archive_file.lambda[each.key].output_base64sha256

  environment {
    variables = {
      TABLE_NAME   = aws_dynamodb_table.main.name
      NODE_OPTIONS = "--enable-source-maps"
    }
  }

  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.lambda[each.key].name
  }

  depends_on = [aws_iam_role_policy.lambda]
}
