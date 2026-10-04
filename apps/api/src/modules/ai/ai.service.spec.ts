import { type ConfigService } from '@nestjs/config';
import { type Env } from '../../config/env.validation';
import { createAiProvider } from './ai.module';
import { type AiProvider } from './ai-provider';
import { AiService } from './ai.service';
import { AnthropicAiProvider } from './anthropic-ai.provider';
import { MockAiProvider } from './mock-ai.provider';

const categories = [
  {
    code: 'ROAD_POTHOLE',
    name: 'Yol Çukuru',
    parentName: 'Yol ve Kaldırım',
    keywords: ['çukur'],
    parentKeywords: [],
    defaultPriority: 'HIGH' as const,
  },
];

const config = (values: Partial<Record<keyof Env, unknown>>) =>
  ({
    get: (key: keyof Env) => ({ AI_MODEL: 'claude-opus-5', AI_TIMEOUT_MS: 15000, ...values })[key],
  }) as unknown as ConfigService<Env, true>;

describe('AI provider selection', () => {
  it('uses the mock by default and when the Anthropic key is missing', () => {
    expect(createAiProvider(config({ AI_PROVIDER: 'mock' }))).toBeInstanceOf(MockAiProvider);
    expect(createAiProvider(config({ AI_PROVIDER: 'anthropic' }))).toBeInstanceOf(MockAiProvider);
  });

  it('uses Claude when configured with a key', () => {
    const provider = createAiProvider(config({ AI_PROVIDER: 'anthropic', AI_API_KEY: 'sk-test' }));
    expect(provider).toBeInstanceOf(AnthropicAiProvider);
    expect(provider.model).toBe('claude-opus-5');
  });
});

describe('AiService', () => {
  it('returns the provider answer when it works', async () => {
    const result = await new AiService(new MockAiProvider()).analyze({
      description: 'Yolda çukur var',
      categories,
    });
    expect(result).toMatchObject({ provider: 'mock', fallback: false });
    expect(result.classification.categoryCode).toBe('ROAD_POTHOLE');
  });

  it('falls back to the rule-based provider when the AI provider is unavailable', async () => {
    const broken: AiProvider = {
      name: 'anthropic',
      model: 'claude-opus-5',
      analyzeRequest: () => Promise.reject(new Error('connect ECONNREFUSED')),
      suggestCategory: () => Promise.reject(new Error('x')),
      suggestPriority: () => Promise.reject(new Error('x')),
      summarize: () => Promise.reject(new Error('x')),
    };
    const result = await new AiService(broken).analyze({
      description: 'Yolda çukur var',
      categories,
    });
    expect(result).toMatchObject({ provider: 'mock', model: 'keyword-rules-v1', fallback: true });
    expect(result.classification.categoryCode).toBe('ROAD_POTHOLE');
  });
});
