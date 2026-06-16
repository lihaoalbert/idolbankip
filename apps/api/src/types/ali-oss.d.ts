// ali-oss 6.23.0 不带 .d.ts,这里写一个最小 shim 让 TS 通过
declare module 'ali-oss' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const OSS: any;
  export default OSS;
}
