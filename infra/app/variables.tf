variable "name" {
  description = "리소스 이름 접두사"
  type        = string
  default     = "albapay"
}

variable "region" {
  description = "DynamoDB, Lambda, S3를 만들 리전. CloudFront는 전역 서비스라 리전과 상관없다"
  type        = string
  default     = "ap-northeast-2"
}

variable "log_retention_days" {
  description = "Lambda 로그 보관 기간(일)"
  type        = number
  default     = 30
}

variable "alert_email" {
  description = "예산 알림을 받을 이메일. null이면 예산 알림을 만들지 않는다. terraform.tfvars에 넣고 커밋하지 않는다"
  type        = string
  default     = null
}

variable "monthly_budget_usd" {
  description = "월 예산(USD). 계정 전체 비용 기준이다"
  type        = number
  default     = 5
}
