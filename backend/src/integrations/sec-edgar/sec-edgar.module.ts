import { Module, Global } from '@nestjs/common';
import { SecEdgarService } from './sec-edgar.service.js';

@Global()
@Module({
  providers: [SecEdgarService],
  exports: [SecEdgarService],
})
export class SecEdgarModule {}
