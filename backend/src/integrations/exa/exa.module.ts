import { Module, Global } from '@nestjs/common';
import { ExaService } from './exa.service.js';

@Global()
@Module({
  providers: [ExaService],
  exports: [ExaService],
})
export class ExaModule {}
