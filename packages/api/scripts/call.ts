// 배포한 API를 터미널에서 부른다. 웹앱이 없을 때 배포를 확인하거나 데이터를 직접 넣을 때 쓴다.
//
// 사용:
//   export ALBAPAY_URL=https://xxxx.cloudfront.net
//   read -rs ALBAPAY_TOKEN && export ALBAPAY_TOKEN   # 셸 기록에 토큰이 남지 않게 입력받는다
//   pnpm --filter @albapay/api call GET /api/config
//   pnpm --filter @albapay/api call PUT /api/config/settings '{"hireDate":"2026-03-02", ...}'
//   pnpm --filter @albapay/api call POST /api/rules @rule.json     # @로 시작하면 명령을 실행한 폴더 기준으로 파일을 읽는다
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TOKEN_HEADER } from '../src/http/auth';

const [method, path, bodyArg] = process.argv.slice(2);
const baseUrl = process.env['ALBAPAY_URL'];
const token = process.env['ALBAPAY_TOKEN'];

if (!method || !path?.startsWith('/')) {
  console.error('사용법: call <GET|POST|PUT|DELETE> </api/...> [JSON 본문 | @파일]');
  process.exit(1);
}
if (!baseUrl || !token) {
  console.error('ALBAPAY_URL과 ALBAPAY_TOKEN 환경 변수가 필요합니다.');
  process.exit(1);
}

async function readBody(arg: string | undefined): Promise<string | undefined> {
  if (arg === undefined) return undefined;
  if (!arg.startsWith('@')) return arg;
  // pnpm --filter는 패키지 폴더에서 스크립트를 돌리므로, 사용자가 명령을 친 폴더(INIT_CWD) 기준으로 경로를 푼다.
  return readFile(resolve(process.env['INIT_CWD'] ?? process.cwd(), arg.slice(1)), 'utf8');
}

const body = await readBody(bodyArg);

const headers: Record<string, string> = { [TOKEN_HEADER]: token };
if (body !== undefined) {
  headers['content-type'] = 'application/json';
  // CloudFront OAC가 본문까지 서명하려면 클라이언트가 본문의 SHA-256을 이 헤더로 보내야 한다.
  headers['x-amz-content-sha256'] = createHash('sha256').update(body, 'utf8').digest('hex');
}

const response = await fetch(new URL(path, baseUrl), {
  method: method.toUpperCase(),
  headers,
  ...(body === undefined ? {} : { body }),
});
const text = await response.text();
console.log(`${response.status} ${response.statusText}`);
if (text) {
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}
process.exitCode = response.ok ? 0 : 1;
