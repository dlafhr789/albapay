terraform {
  # S3 백엔드의 use_lockfile(DynamoDB 없이 상태 잠금)이 1.10부터 있다.
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.71"
    }
  }

  # 이 구성은 상태 저장소 자체를 만들기 때문에 상태를 로컬 파일에 둔다.
  # terraform.tfstate는 .gitignore에 들어 있다.
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = var.name
      ManagedBy = "terraform"
    }
  }
}
