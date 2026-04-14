import { Module, Global } from '@nestjs/common';
import { AnthropicService } from './anthropic.service.js';

@Global()
@Module({
  providers: [AnthropicService],
  exports: [AnthropicService],
})
export class AnthropicModule {}
