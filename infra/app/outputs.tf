output "table_name" {
  description = "DynamoDB 테이블 이름. 토큰을 발급할 때 TABLE_NAME으로 쓴다"
  value       = aws_dynamodb_table.main.name
}

output "lambda_functions" {
  description = "Lambda 함수 이름"
  value       = { for key, fn in aws_lambda_function.this : key => fn.function_name }
}
