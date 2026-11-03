variable "name" {
  description = "리소스 이름 접두사"
  type        = string
  default     = "albapay"
}

variable "region" {
  description = "상태 버킷을 만들 리전"
  type        = string
  default     = "ap-northeast-2"
}
