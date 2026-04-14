import { Module, Global } from '@nestjs/common';
import { OpenAIService } from './openai.service.js';

@Global()
@Module({
  providers: [OpenAIService],
  exports: [OpenAIService],
})
export class OpenAIModule {}
