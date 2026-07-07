// @alicloud/dysmsapi-2017-05-25 1.0.1 不带 .d.ts,这里写一个最小 shim 让 TS 通过
// 用 `any` 跟 ali-oss.d.ts 一致 — 真 driver 实例化时 SDK runtime 校验参数
declare module '@alicloud/dysmsapi-2017-05-25' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Dysmsapi20170525 = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Dysmsapi20170525: any;
  export default Dysmsapi20170525;
}
