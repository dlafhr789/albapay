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
