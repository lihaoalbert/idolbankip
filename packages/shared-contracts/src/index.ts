// 共享契约统一出口
export * from './blockchain';
export * from './esign';
export * from './kyc';
export * from './payment';
export * from './watermark';
export * from './moderation';

export { MockBlockchainClient } from './mocks/mock-blockchain';
export { MockFadadaClient } from './mocks/mock-esign';
export { MockKycClient } from './mocks/mock-kyc';
export { MockPaymentClient } from './mocks/mock-payment';
export { MockWatermarkClient } from './mocks/mock-watermark';
export { MockModerationClient } from './mocks/mock-moderation';