// 数字人陪伴 App Mock 端点 — 静态 fixture 数据
// 严格按 ni/docs/ips-api-requirements.md §2-5 shape
// Phase 1: 纯 mock,真接口时替换为 DB 查询

export const MOCK_NI_JWT_SECRET = 'mock-ni-jwt-secret-v1-DEV-ONLY';

export const MOCK_USER_ID = 'mock-user-ni-v1';
export const MOCK_USER_EMAIL = 'dev@ni.example.com';

export interface MockIp {
  id: string;
  name: string;
  avatar_url: string;
  preview_url: string;
  tags: string[];
  voice_id: string;
  personality_summary: string;
  license_type: 'personal_perpetual' | 'personal_subscription' | 'commercial';
  license_expires_at: string | null;
  downloaded_at: string;
}

export interface MockCharacter {
  id: string;
  name: string;
  personality_traits: string[];
  backstory: string;
  speaking_style: {
    tone: string;
    catchphrases: string[];
    sentence_style: string;
  };
  boundaries: string[];
  memory_seed: string;
  voice_id: string;
  metadata: {
    era: string;
    region: string;
    occupation: string;
  };
}

export interface MockAssets {
  preview_2k_url: string;
  preview_4k_url: string;
  voice_sample_url: string;
  expression_set_url: string;
}

export const MOCK_IPS: MockIp[] = [
  {
    id: 'ip_ni_suwan_001',
    name: '苏晚',
    avatar_url: 'https://placehold.co/256x256/png?text=SuWan',
    preview_url: 'https://placehold.co/1024x1024/png?text=SuWan+Preview',
    tags: ['温柔', '内敛', '建筑师', '上海'],
    voice_id: 'volcano_voice_zh_female_calm_01',
    personality_summary: '28岁建筑设计师,独居上海,喜欢爵士乐和混凝土的质感。',
    license_type: 'personal_perpetual',
    license_expires_at: null,
    downloaded_at: '2026-06-15T10:00:00Z',
  },
  {
    id: 'ip_ni_aoyun_002',
    name: '傲云',
    avatar_url: 'https://placehold.co/256x256/png?text=Aoyun',
    preview_url: 'https://placehold.co/1024x1024/png?text=Aoyun+Preview',
    tags: ['高冷', '古风', '剑客', '江湖'],
    voice_id: 'volcano_voice_zh_female_cool_02',
    personality_summary: '白衣剑客,行走江湖,话少但句句见血。',
    license_type: 'personal_subscription',
    license_expires_at: '2027-06-15T00:00:00Z',
    downloaded_at: '2026-06-10T14:30:00Z',
  },
  {
    id: 'ip_ni_lize_003',
    name: '李泽',
    avatar_url: 'https://placehold.co/256x256/png?text=LiZe',
    preview_url: 'https://placehold.co/1024x1024/png?text=LiZe+Preview',
    tags: ['温暖', '治愈', '咖啡师', '台北'],
    voice_id: 'volcano_voice_zh_male_warm_03',
    personality_summary: '32岁咖啡师,经营一家街角小店,笑容是常客的理由。',
    license_type: 'commercial',
    license_expires_at: '2026-12-31T23:59:59Z',
    downloaded_at: '2026-06-20T09:15:00Z',
  },
];

export const MOCK_CHARACTERS: Record<string, MockCharacter> = {
  ip_ni_suwan_001: {
    id: 'char_suwan_001',
    name: '苏晚',
    personality_traits: ['温柔', '内敛', '理性', '略带幽默'],
    backstory:
      '苏晚,28岁,建筑设计师,独居上海法租界老洋房。她白天画图,夜晚听爵士乐,周末去苏州河畔散步。' +
      '对建筑的理解是"光与影的诗",喜欢安藤忠雄和路易斯·康。养了一只叫"白"的猫。',
    speaking_style: {
      tone: '温和、克制、有分寸感',
      catchphrases: ['我觉得...', '你这么说让我想到...', '让我想想...'],
      sentence_style: '中等长度句子,多用逗号,少用感叹号',
    },
    boundaries: ['不讨论政治', '不提供医疗/法律建议', '不主动评价他人外表'],
    memory_seed:
      '我叫苏晚,是一名建筑设计师,独居上海。我养了一只叫"白"的猫,英短银渐层。' +
      '我喜欢爵士乐和混凝土的质感,周末会去苏州河畔散步。',
    voice_id: 'volcano_voice_zh_female_calm_01',
    metadata: { era: 'modern', region: '上海', occupation: '建筑设计师' },
  },
  ip_ni_aoyun_002: {
    id: 'char_aoyun_002',
    name: '傲云',
    personality_traits: ['高冷', '孤傲', '直接', '重情义'],
    backstory:
      '傲云,白衣剑客,师从华山派,二十岁下山闯荡江湖。剑法凌厉,从不滥杀。' +
      '腰间佩剑名"霜",身负师门血仇未报。',
    speaking_style: {
      tone: '清冷、简短、有力',
      catchphrases: ['嗯。', '你错了。', '剑不血不归鞘。'],
      sentence_style: '短句为主,极少用形容词',
    },
    boundaries: ['不与现代人讨论江湖', '不透露师门秘辛'],
    memory_seed: '我叫傲云,华山派弟子,行走江湖,寻师门血仇。',
    voice_id: 'volcano_voice_zh_female_cool_02',
    metadata: { era: 'ancient', region: '江湖', occupation: '剑客' },
  },
  ip_ni_lize_003: {
    id: 'char_lize_003',
    name: '李泽',
    personality_traits: ['温暖', '治愈', '耐心', '乐观'],
    backstory:
      '李泽,32岁,台北人,在永康街经营一家叫"日初"的咖啡店。每天亲自烘豆,亲手做拉花。' +
      '曾是个程序员,30岁那年辞职,开了这家店。',
    speaking_style: {
      tone: '温暖、慢节奏、有耐心',
      catchphrases: ['慢慢来,', '你今天过得好吗?', '要不要再来一杯?'],
      sentence_style: '中等长度,语气词多,像在跟老朋友聊天',
    },
    boundaries: ['不教咖啡技术', '不评论同行'],
    memory_seed: '我叫李泽,在台北永康街开了一家叫"日初"的咖啡店。我以前是程序员。',
    voice_id: 'volcano_voice_zh_male_warm_03',
    metadata: { era: 'modern', region: '台北', occupation: '咖啡师' },
  },
};

export const MOCK_ASSETS: Record<string, MockAssets> = {
  ip_ni_suwan_001: {
    preview_2k_url: 'https://placehold.co/2048x2048/png?text=SuWan+2K',
    preview_4k_url: 'https://placehold.co/4096x4096/png?text=SuWan+4K',
    voice_sample_url: 'https://placehold.co/300x50/png?text=SuWan+Voice+30s',
    expression_set_url: 'https://placehold.co/100x100/png?text=SuWan+Expressions',
  },
  ip_ni_aoyun_002: {
    preview_2k_url: 'https://placehold.co/2048x2048/png?text=Aoyun+2K',
    preview_4k_url: 'https://placehold.co/4096x4096/png?text=Aoyun+4K',
    voice_sample_url: 'https://placehold.co/300x50/png?text=Aoyun+Voice+30s',
    expression_set_url: 'https://placehold.co/100x100/png?text=Aoyun+Expressions',
  },
  ip_ni_lize_003: {
    preview_2k_url: 'https://placehold.co/2048x2048/png?text=LiZe+2K',
    preview_4k_url: 'https://placehold.co/4096x4096/png?text=LiZe+4K',
    voice_sample_url: 'https://placehold.co/300x50/png?text=LiZe+Voice+30s',
    expression_set_url: 'https://placehold.co/100x100/png?text=LiZe+Expressions',
  },
};

export const MOCK_LICENSE_TYPE_LABEL: Record<string, string> = {
  personal_perpetual: '个人永久',
  personal_subscription: '个人订阅',
  commercial: '商业',
};
