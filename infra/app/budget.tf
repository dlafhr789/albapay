# 한 사람이 쓰는 사용량은 상시 무료 한도 안이라 평소 요금은 거의 0원이다.
# 그래서 요금이 나오기 시작하면 설정 실수나 비정상 호출일 가능성이 높아서, 바로 알 수 있게 메일을 보낸다.
# 비용 할당 태그를 켜지 않아도 되도록 계정 전체 비용을 기준으로 한다.

resource "aws_budgets_budget" "monthly" {
  count = var.alert_email == null ? 0 : 1

  name         = "${var.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # 이번 달 예상 비용이 예산의 80%를 넘을 것 같을 때
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }

  # 실제 비용이 예산을 넘었을 때
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
}
