output "state_bucket" {
  description = "infra/app의 backend.hcl에 넣을 버킷 이름"
  value       = aws_s3_bucket.state.bucket
}

output "region" {
  value = var.region
}
