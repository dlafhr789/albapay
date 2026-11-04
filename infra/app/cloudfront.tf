# 웹앱과 API를 도메인 하나로 내보낸다. 같은 출처라서 CORS 설정이 필요 없다.
#
#   /api/*  -> Lambda Function URL (AWS_IAM, OAC가 SigV4로 서명)
#   /cal/*  -> 같은 Lambda Function URL. 캘린더 구독 피드
#   그 외   -> S3 웹 버킷 (OAC)
#
# 구성을 이렇게 정한 이유는 docs/decisions/0002에 있다.

# ── API 오리진 ───────────────────────────────────────────

# 인증 방식이 AWS_IAM이라 서명 없는 요청은 Lambda가 바로 403으로 거부한다.
# 서명할 수 있는 곳은 아래 권한을 받은 이 CloudFront 배포뿐이다.
resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.this["api"].function_name
  authorization_type = "AWS_IAM"
  invoke_mode        = "BUFFERED"
}

# Function URL을 CloudFront OAC로 부르려면 두 권한이 모두 있어야 한다.
resource "aws_lambda_permission" "cloudfront_function_url" {
  statement_id           = "AllowCloudFrontInvokeFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.this["api"].function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.main.arn
  function_url_auth_type = "AWS_IAM"
}

resource "aws_lambda_permission" "cloudfront_invoke" {
  statement_id             = "AllowCloudFrontInvokeFunction"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.this["api"].function_name
  principal                = "cloudfront.amazonaws.com"
  source_arn               = aws_cloudfront_distribution.main.arn
  invoked_via_function_url = true
}

resource "aws_cloudfront_origin_access_control" "api" {
  name                              = "${var.name}-api"
  description                       = "Lambda Function URL 요청 서명"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.name}-web"
  description                       = "S3 웹 버킷 요청 서명"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── 정책 ────────────────────────────────────────────────

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

# Host만 빼고 헤더, 쿼리 문자열, 쿠키를 모두 넘긴다. Host를 넘기면 Lambda URL이 자기 도메인이 아니라서 거부한다.
# X-App-Token과 x-amz-content-sha256도 이 정책으로 넘어간다.
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "${var.name}-security"
  comment = "웹앱과 API 응답의 보안 헤더"

  security_headers_config {
    # 외부 스크립트, 폰트, 분석 도구를 넣지 않는다는 규칙을 브라우저가 강제하게 한다.
    content_security_policy {
      content_security_policy = join("; ", [
        "default-src 'self'",
        "img-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ])
      override = true
    }

    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = false
      preload                    = false
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "no-referrer"
      override        = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "camera=(), microphone=(), geolocation=(), payment=()"
      override = true
    }
  }
}

# 웹앱 화면 주소(/payroll 등)를 index.html로 바꾼다. 내용과 이유는 functions/spa-routing.js에 있다.
resource "aws_cloudfront_function" "spa_routing" {
  name    = "${var.name}-spa-routing"
  runtime = "cloudfront-js-2.0"
  comment = "확장자 없는 웹앱 경로를 index.html로"
  publish = true
  code    = file("${path.module}/functions/spa-routing.js")
}

# ── 배포 ────────────────────────────────────────────────

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  comment             = var.name
  default_root_object = "index.html"
  http_version        = "http2and3"
  is_ipv6_enabled     = true
  # 한국 엣지가 들어가는 가장 싼 등급
  price_class = "PriceClass_200"

  origin {
    origin_id                = "web"
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  origin {
    origin_id                = "api"
    domain_name              = split("/", aws_lambda_function_url.api.function_url)[2]
    origin_access_control_id = aws_cloudfront_origin_access_control.api.id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id           = "web"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_routing.arn
    }
  }

  # 개인 급여 정보라 캐시하지 않는다. API도 응답에 Cache-Control: no-store를 붙인다.
  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = "api"
    viewer_protocol_policy     = "https-only"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  # 캘린더 앱이 받아 가는 구독 피드. 주소 안의 토큰으로 확인한다(docs/decisions/0004).
  # 캐시하면 구독을 끊거나 주소를 새로 만든 뒤에도 이전 응답이 나갈 수 있어서 캐시하지 않는다.
  ordered_cache_behavior {
    path_pattern               = "/cal/*"
    target_origin_id           = "api"
    viewer_protocol_policy     = "https-only"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
