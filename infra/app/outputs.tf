output "table_name" {
  description = "DynamoDB 테이블 이름. 토큰을 발급할 때 TABLE_NAME으로 쓴다"
  value       = aws_dynamodb_table.main.name
}

output "lambda_functions" {
  description = "Lambda 함수 이름"
  value       = { for key, fn in aws_lambda_function.this : key => fn.function_name }
}

output "url" {
  description = "웹앱과 API 주소"
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "distribution_id" {
  description = "캐시를 비울 때 쓰는 CloudFront 배포 ID"
  value       = aws_cloudfront_distribution.main.id
}

output "web_bucket" {
  description = "웹앱 정적 파일을 올리는 버킷"
  value       = aws_s3_bucket.web.bucket
}
