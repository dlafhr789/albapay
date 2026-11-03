// Lambda에 올릴 묶음을 만든다. 함수마다 `dist/<이름>/index.cjs` 하나와 소스 맵이 생긴다.
// Terraform(`infra/app`)이 이 폴더를 압축해서 배포한다.
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/** Lambda 함수 이름(접두사 뒤)과 진입점 */
export const ENTRY_POINTS = {
  api: 'src/handler.ts',
  materializer: 'src/materializer.ts',
} as const;

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

export async function buildLambdas(outdir: string): Promise<void> {
  await rm(outdir, { recursive: true, force: true });
  await build({
    absWorkingDir: packageRoot,
    entryPoints: ENTRY_POINTS,
    entryNames: '[name]/index',
    outdir,
    bundle: true,
    platform: 'node',
    // Lambda 런타임(nodejs24.x)과 로컬 개발 환경(Node 22)에서 모두 돌도록 낮은 쪽에 맞춘다.
    target: 'node22',
    // 패키지에 "type": "module"이 있어도 CommonJS로 읽히도록 확장자를 .cjs로 한다.
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
    // AWS SDK는 런타임에 들어 있는 것을 쓰지 않고 묶는다. 런타임이 SDK를 올려도 동작이 바뀌지 않게 하기 위해서다.
    mainFields: ['module', 'main'],
    minify: true,
    sourcemap: true,
    sourcesContent: false,
    legalComments: 'none',
    logLevel: 'warning',
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildLambdas(fileURLToPath(new URL('../dist', import.meta.url)));
}
