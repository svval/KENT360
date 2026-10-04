import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Env } from '../../config/env.validation';
import { type AiProvider, AI_PROVIDER } from './ai-provider';
import { AiService } from './ai.service';
import { AnthropicAiProvider } from './anthropic-ai.provider';
import { DuplicateService } from './duplicate.service';
import { MockAiProvider } from './mock-ai.provider';
import { RequestAnalysisService } from './request-analysis.service';

/** AI_PROVIDER=anthropic needs AI_API_KEY; otherwise the deterministic mock is used. */
export function createAiProvider(config: ConfigService<Env, true>): AiProvider {
  const kind = config.get('AI_PROVIDER', { infer: true });
  const key = config.get('AI_API_KEY', { infer: true });
  if (kind === 'anthropic') {
    if (key) {
      return new AnthropicAiProvider(
        key,
        config.get('AI_MODEL', { infer: true }),
        config.get('AI_TIMEOUT_MS', { infer: true }),
      );
    }
    new Logger('AiModule').warn(
      'AI_PROVIDER=anthropic without AI_API_KEY – using the mock provider',
    );
  }
  return new MockAiProvider();
}

@Module({
  providers: [
    { provide: AI_PROVIDER, inject: [ConfigService], useFactory: createAiProvider },
    AiService,
    DuplicateService,
    RequestAnalysisService,
  ],
  exports: [AiService, DuplicateService, RequestAnalysisService],
})
export class AiModule {}
