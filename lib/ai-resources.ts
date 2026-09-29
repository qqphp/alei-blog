// Frontend collection. Official references checked on this date; no personal testing is implied.
export interface AiAgent {
  id: string;
  name: string;
  creator: string;
  logo: string;
  description: string;
  capabilities: string[];
  tags: string[];
  status: string;
  href: string;
}

export interface AiSkill {
  id: string;
  name: string;
  title: string;
  categoryId: string;
  description: string;
  scenario: string;
  input: string;
  output: string;
  note: string;
  href: string;
  prompt: string;
}

export interface AiRelay {
  id: string;
  name: string;
  mark: string;
  logo: string;
  category: string;
  description: string;
  features: string[];
  focus: string;
  endpoint: string;
  href: string;
}

export interface AiSkillCategory {
  id: string;
  name: string;
  parentId: string;
}

export const skillCategorySample: AiSkillCategory = { id: 'skill-category-sample', name: '', parentId: '' };

export interface AiAgentStatus {
  id: string;
  name: string;
}

export const agentStatuses: AiAgentStatus[] = [
  { id: 'active', name: '已上线' },
  { id: 'beta', name: '公测中' },
  { id: 'coming', name: '即将推出' },
];

export const aiAgents: AiAgent[] = [
  {
    id: 'hermes-agent',
    name: 'Hermes Agent',
    creator: 'Nous Research',
    logo: '🧠',
    description: '一个能够理解并响应自然语言的智能助手，专注复杂推理和本地化任务执行。',
    capabilities: ['自然语言理解', '任务编排', '多步推理', '代码执行'],
    tags: ['开源', '推理型', '助手'],
    status: 'active',
    href: 'https://github.com/NousResearch/Hermes',
  },
  {
    id: 'open-claw',
    name: 'Open Claw',
    creator: 'Community',
    logo: '🦅',
    description: '构建定制化 AI 工作流的开源智能体框架，提供强大的工具集成和记忆管理机制。',
    capabilities: ['工作流定制', '工具链集成', '长期记忆', '多端协同'],
    tags: ['框架', '自定义', '工程化'],
    status: 'active',
    href: 'https://github.com/open-claw/core',
  },
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    creator: 'Productivity AI',
    logo: '🤖',
    description: '由 AI 驱动的生产力伴侣，融入日常办公场景，自动处理文档、会议记录及日程规划。',
    capabilities: ['文档分析', '会议纪要', '日程自动化', '邮件起草'],
    tags: ['生产力', '伴侣', '商业化'],
    status: 'beta',
    href: 'https://workbuddy.ai',
  },
];

export const aiSkills: AiSkill[] = [
  {
    id: 'frontend-design',
    name: 'frontend-design',
    title: '让界面有自己的性格',
    categoryId: '',
    description: '把视觉方向、排版和组件细节放进同一次前端创作。',
    scenario: '准备做一个新页面，或想摆脱千篇一律的默认组件时。',
    input: '页面目标、内容、参考风格与技术约束',
    output: '可运行的前端界面',
    note: '先给出真实内容和边界，再用实际页面检查布局。',
    href: 'https://github.com/anthropics/skills/tree/main/skills/frontend-design',
    prompt:
      '请使用 frontend-design skill，为我的项目设计并实现一个页面。先阅读项目约定，再根据我提供的页面目标、真实内容和视觉参考确定方向；沿用现有技术栈，完成后检查桌面和移动端布局。',
  },
  {
    id: 'webapp-testing',
    name: 'webapp-testing',
    title: '走一遍真实的使用路径',
    categoryId: '',
    description: '用浏览器检查本地应用，把交互结果变成可复查的证据。',
    scenario: '表单、菜单或页面流程刚改完，需要确认它真的能用时。',
    input: '本地地址、待验证流程与预期结果',
    output: '交互检查、截图与问题记录',
    note: '测试数据与真实数据分开，明确哪些操作允许执行。',
    href: 'https://github.com/anthropics/skills/tree/main/skills/webapp-testing',
    prompt:
      '请使用 webapp-testing skill，检查我提供的本地应用和操作流程。先确认测试地址及测试数据，逐步验证预期结果，记录复现步骤与证据；未执行的检查请明确标注。',
  },
  {
    id: 'skill-creator',
    name: 'skill-creator',
    title: '把重复的方法留成 Skill',
    categoryId: '',
    description: '把一套常用做法整理为可重复使用、可继续改进的技能。',
    scenario: '同一类任务反复解释，希望把方法稳定地复用时。',
    input: '任务边界、操作步骤与成功示例',
    output: '技能说明与验证思路',
    note: '从一个明确任务开始，用真实案例检查触发和输出。',
    href: 'https://github.com/anthropics/skills/tree/main/skills/skill-creator',
    prompt:
      '请使用 skill-creator skill，把我提供的重复任务整理成一个技能。先明确适用场景、输入、输出和边界，再编写技能说明，并用代表性案例验证；缺少的材料请指出。',
  },
  {
    id: 'code-review',
    name: 'code-review',
    title: '全方位代码审查',
    categoryId: '',
    description: '不仅检查语法，更关注架构设计、安全性及性能瓶颈。',
    scenario: '提交 Pull Request 前的质量把关。',
    input: '代码变更差异（Git Diff）、项目规范要求',
    output: '结构化审查报告及修改建议代码',
    note: '对于大型变更，建议分模块输入。',
    href: 'https://github.com/anthropics/skills/tree/main/skills/code-review',
    prompt:
      '请使用 code-review skill，对我提交的代码变更进行审查。重点关注架构合理性、安全风险和性能瓶颈，给出带代码示例的修改建议。',
  },
  {
    id: 'data-extract',
    name: 'data-extract',
    title: '非结构化数据清洗',
    categoryId: '',
    description: '从长文本、网页或 PDF 中提取特定的字段实体。',
    scenario: '需要将大量研报或新闻转化为数据库结构时。',
    input: '原始杂乱文本、目标 JSON Schema',
    output: '符合预期的 JSON 数组',
    note: '定义好严格的数据格式和缺失值的处理策略。',
    href: 'https://github.com/anthropics/skills/tree/main/skills/data-extract',
    prompt:
      '请使用 data-extract skill，从我提供的原始文本中提取结构化数据。按照指定的 JSON Schema 输出，遇到缺失字段标注为 null，不要编造数据。',
  },
  {
    id: 'copywriting',
    name: 'copywriting',
    title: '高转化率文案创作',
    categoryId: '',
    description: '撰写具有吸引力的营销文案、产品介绍或社交媒体内容。',
    scenario: '推出新产品，需要撰写落地页文案或推广推文。',
    input: '产品卖点、目标受众群体、品牌基调',
    output: '多版本、适合不同渠道的营销文案',
    note: '明确文案需要引导的下一步行动（CTA）。',
    href: 'https://github.com/anthropics/skills/tree/main/skills/copywriting',
    prompt:
      '请使用 copywriting skill，根据我提供的产品卖点和目标受众，撰写多版本营销文案。包含标题、正文和 CTA，适配不同投放渠道。',
  },
];

export const aiRelays: AiRelay[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    mark: 'OR',
    logo: '/ai/relays/openrouter.png',
    category: '模型聚合',
    description: '通过统一接口访问不同供应商的模型，集中管理调用入口。',
    features: ['统一 API', '模型路由', '备用模型'],
    focus: '想在同一项目里尝试不同模型',
    endpoint: 'https://openrouter.ai/api/v1',
    href: 'https://openrouter.ai',
  },
  {
    id: 'poe',
    name: 'Poe API',
    mark: 'POE',
    logo: '/ai/relays/poe.png',
    category: '生态聚合',
    description: '提供主流模型及大量社区创建的定制机器人接口。',
    features: ['丰富机器人', '订阅式访问', '即插即用'],
    focus: '需要直接调用社区现成配置的机器人',
    endpoint: 'https://api.poe.com/v1',
    href: 'https://poe.com',
  },
  {
    id: 'teamorouter',
    name: 'TeamoRouter',
    mark: 'TR',
    logo: '/ai/relays/teamorouter.ico',
    category: '私有中转',
    description: '项目专属的稳定代理服务，确保国内环境的连通性及调用统计。',
    features: ['高稳定性', '数据可视化', '负载均衡'],
    focus: '项目生产环境的稳定调用',
    endpoint: 'https://api.teamorouter.com/v1',
    href: 'https://teamorouter.com',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow (硅基流动)',
    mark: 'SF',
    logo: '/ai/relays/siliconflow.svg',
    category: '云端推理',
    description: '提供极具性价比的开源大模型云端推理 API 服务，主打低延迟。',
    features: ['超低延迟', '高并发', '开源模型友好'],
    focus: '需要高速且低成本调用开源模型',
    endpoint: 'https://api.siliconflow.cn/v1',
    href: 'https://siliconflow.cn',
  },
  {
    id: 'oneapi',
    name: 'One API / 松鼠AI',
    mark: 'ONE',
    logo: '/ai/relays/oneapi.png',
    category: '聚合分发',
    description: '兼容多种大模型 API，支持多额度、多渠道管理的分发系统。',
    features: ['渠道管理', '额度控制', '兼容 OpenAI 格式'],
    focus: '需要自建团队级 API 分发网关',
    endpoint: 'https://api.oneapi.com/v1',
    href: 'https://github.com/songquanpeng/one-api',
  },
];
