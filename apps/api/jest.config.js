// Jest 配置 — ibi.ren api
// why 独立 tsconfig: tsconfig.json 的 exclude=["test"] 是为 nest build 排除测试,
//                  ts-jest 用 tsconfig.test.json(include src + test)编译测试文件.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@ibi-ren/shared-contracts$':
      '<rootDir>/../../packages/shared-contracts/src',
    '^@ibi-ren/shared-contracts/(.*)$':
      '<rootDir>/../../packages/shared-contracts/src/$1',
    // ali-oss 是 ESM only,Jest 默认 CJS transform 解析不动;
    // 在测试里我们用 mock UploadService 绕过,这里 stub 掉即可
    '^ali-oss$': '<rootDir>/test/__mocks__/ali-oss.ts',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};