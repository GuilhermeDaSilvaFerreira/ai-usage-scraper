import { Module, Global } from '@nestjs/common';
import { WikipediaService } from './wikipedia.service.js';

@Global()
@Module({
  providers: [WikipediaService],
  exports: [WikipediaService],
})
export class WikipediaModule {}
