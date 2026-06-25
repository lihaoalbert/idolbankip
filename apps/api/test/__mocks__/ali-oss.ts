// ali-oss 是 ESM-only 包,Jest 默认 CJS transform 解析不动。
// Track B 集成后,BlueprintModule 拉起时 UploadService 会被 import,
// 而 UploadService 顶部 `import OSS from 'ali-oss'` 会让 jest 卡在 import 阶段。
// 解法:moduleNameMapper 把 ali-oss 指向这个 stub,提供最小 surface 让 UploadService 类能 import 通。
// 真正跑测试时,BlueprintModule 用 .overrideProvider(UploadService) 替换 mock,
// 不会真的走到 ali-oss 路径,这里只保证 import 链不爆。

const stub = jest.fn().mockImplementation(function () {
  return {
    put: jest.fn(),
    putSymlink: jest.fn(),
    getSymlink: jest.fn(),
    signUrl: jest.fn().mockResolvedValue('https://oss.example.com/stub'),
    head: jest.fn(),
    delete: jest.fn(),
  };
});

export default stub;
module.exports = stub;
module.exports.default = stub;
