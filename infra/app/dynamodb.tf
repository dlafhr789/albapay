# 모든 데이터를 담는 테이블 하나. 키 설계는 docs/data-model.md에 있다.
resource "aws_dynamodb_table" "main" {
  name     = var.name
  hash_key = "PK"
  # 근무 SK는 `<workDate>#<id>`라서 Query 결과가 날짜순으로 나온다.
  range_key = "SK"

  # 상시 무료 한도(읽기·쓰기 각 25)를 넘지 않게 프로비저닝 모드로 둔다.
  # 사용자가 한 명이라 평소에는 초당 몇 건이지만, 규칙을 저장할 때 근무 수십 건을 한 번에 쓴다.
  # 그때는 쓰지 않고 쌓인 버스트 용량(최대 300초분)을 쓰고, 그래도 넘치면 SDK가 다시 시도한다.
  billing_mode   = "PROVISIONED"
  read_capacity  = 10
  write_capacity = 10

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  # 실수로 지우거나 덮어쓴 데이터를 35일 안의 어느 시점으로든 되돌릴 수 있다. 데이터가 작아서 비용은 거의 없다.
  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = true
}
