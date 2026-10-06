export const markdownAiLimit = 12000;
export const markdownAiActions = ['markdown-diagnose', 'markdown-repair', 'markdown-polish'] as const;
export type MarkdownAiAction = typeof markdownAiActions[number];
export type MarkdownIssue = {
  location: string;
  category: string;
  excerpt: string;
  suggestion: string;
  reason: string;
};
export type MarkdownAiResult = { issues: MarkdownIssue[] } | { markdown: string };

export const markdownAiDefaults = {
  markdownDiagnosePrompt: '你是一位细致的中文文字编辑。检查 Markdown 正文中的语法、错别字、标点、歧义、冗长句、衔接和通顺程度。只报告有上下文依据的问题；正常短句、排比和专业术语不算错误。引用原文片段，给出具体建议与原因，没有问题时返回空的问题列表。不要修改正文，不作事实核查结论。',
  markdownRepairPrompt: '根据提供的诊断问题，以最小改动修复 Markdown 正文。逐项核对建议，只修复原文确有的问题，不扩写、不改观点、不重排结构。保留作者口吻和独立信息。返回完整修订稿；无需修改的部分原样保留。',
  // Principles adapted from https://github.com/op7418/Humanizer-zh (2026-09-23 revision).
  markdownPolishPrompt: '润色已有中文 Markdown，使表达自然、清楚，保持原有文体与作者声音。根据上下文处理空泛铺垫、同义重复、宣传套话、机械开头、层叠长定语和妨碍理解的句式。保留正常的连接词、排比、四字表达和必要正式语气，不机械删词或强行拆成短句。保留事实、数字、否定、条件、归因、时间与确定程度，不把推测改为定论，不补写人物经历或论据。先通读，再修改，最后对照原稿检查遗漏和含义变化；已清楚的段落可以原样保留。返回完整润色稿。',
};

export function markdownLength(markdown: string) {
  return Array.from(markdown).length;
}

export function validateMarkdownInput(markdown: unknown): asserts markdown is string {
  if (typeof markdown !== 'string' || !markdown.trim()) throw new Error('请先填写 Markdown 正文。');
  if (markdownLength(markdown) > markdownAiLimit)
    throw new Error('AI 单次处理最多 12,000 个字符，请缩短正文后重试。');
}

export function validateMarkdownIssues(issues: unknown, markdown: string): asserts issues is MarkdownIssue[] {
  if (!Array.isArray(issues) || issues.length > 40 || markdownLength(JSON.stringify(issues)) > 24000)
    throw new Error('诊断结果格式无效，请重新诊断。');
  for (const issue of issues) {
    if (!issue || typeof issue !== 'object' ||
      !['location', 'category', 'excerpt', 'suggestion', 'reason'].every((key) =>
        typeof issue[key] === 'string' && issue[key].trim() && markdownLength(issue[key]) <= 2000) ||
      !markdown.includes(issue.excerpt)) throw new Error('诊断结果缺少有效的原文片段或建议，请重新诊断。');
  }
}
