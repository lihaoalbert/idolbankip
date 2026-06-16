// ali-oss 6.23.0 不带 .d.ts,这里写一个最小 shim 让 TS 通过
// 既要作为 default import 的值(给 new OSS() 用),也要作为类型(给字段类型注解用)
declare module 'ali-oss' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type OSS = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const OSS: any;
  export default OSS;
}
