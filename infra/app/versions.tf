terraform {
  # S3 백엔드의 use_lockfile(DynamoDB 테이블 없이 상태 잠금)이 1.10부터 있다.
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.71"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.8"
    }
  }

  # 버킷 이름은 backend.hcl로 넘긴다(terraform init -backend-config=backend.hcl).
  # 상태 버킷은 infra/bootstrap이 만든다.
  backend "s3" {
    key          = "app/terraform.tfstate"
    use_lockfile = true
    encrypt      = true
  }
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
