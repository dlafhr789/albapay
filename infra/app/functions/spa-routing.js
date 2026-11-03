// CloudFront 함수(cloudfront-js-2.0). 웹앱 경로(S3) 요청이 CloudFront에 닿자마자 돈다.
// 확장자가 없는 경로(/payroll, /day/2026-11-13)는 웹앱 화면 주소라서 index.html을 돌려준다.
// 그래야 화면 주소에서 새로 고치거나 주소를 직접 열어도 같은 화면이 열린다.
// 사용자 지정 오류 응답(403 -> index.html)을 쓰지 않는 이유: 배포 전체에 걸려서 API의 403·404 응답까지 바꾼다.
function handler(event) {
  var request = event.request;
  var lastSegment = request.uri.substring(request.uri.lastIndexOf('/') + 1);
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
