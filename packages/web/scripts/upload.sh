#!/usr/bin/env bash
# 웹앱을 빌드해서 S3 웹 버킷에 올리고 CloudFront 캐시를 비운다.
# 버킷 이름과 배포 ID는 infra/app의 Terraform 출력에서 읽는다. AWS_PROFILE을 먼저 지정한다.
#
# 사용: pnpm --filter @albapay/web upload
set -euo pipefail

root="$(cd "$(dirname "$0")/../../.." && pwd)"
infra="$root/infra/app"
dist="$root/packages/web/dist"

bucket="$(terraform -chdir="$infra" output -raw web_bucket)"
distribution="$(terraform -chdir="$infra" output -raw distribution_id)"

pnpm --dir "$root" --filter @albapay/web build

# 1. 이름에 해시가 붙은 파일. 내용이 바뀌면 이름도 바뀌어서 1년 동안 캐시해도 된다.
#    지우기는 마지막에 한다. 새 index.html이 올라가기 전에 이전 파일을 지우면 그사이 연 화면이 깨진다.
aws s3 sync "$dist/assets" "s3://$bucket/assets" \
  --cache-control "public, max-age=31536000, immutable"

# 2. 이름이 고정된 파일(index.html, sw.js, 아이콘 등). 브라우저와 CloudFront가 매번 새로 확인하게 한다.
aws s3 sync "$dist" "s3://$bucket" --delete \
  --exclude "assets/*" --exclude "manifest.webmanifest" \
  --cache-control "no-cache"
# aws s3는 .webmanifest의 형식을 몰라서 직접 지정한다.
aws s3 cp "$dist/manifest.webmanifest" "s3://$bucket/manifest.webmanifest" \
  --content-type "application/manifest+json" --cache-control "no-cache"

# 3. 더는 쓰지 않는 해시 파일을 지운다.
aws s3 sync "$dist/assets" "s3://$bucket/assets" --delete \
  --cache-control "public, max-age=31536000, immutable"

# 고정된 이름의 파일은 엣지에 남아 있을 수 있어서 비운다. 경로 하나("/*")로 세어서 월 무료 횟수 안이다.
aws cloudfront create-invalidation --distribution-id "$distribution" --paths "/*" --query 'Invalidation.Id' --output text

echo "올렸습니다: $(terraform -chdir="$infra" output -raw url)"
