import { Module } from '@nestjs/common';
import { FeedbackCyclesController } from './feedback-cycles.controller';
import { FeedbackCyclesService } from './feedback-cycles.service';

@Module({
  controllers: [FeedbackCyclesController],
  providers: [FeedbackCyclesService],
  exports: [FeedbackCyclesService],
})
export class FeedbackCyclesModule {}
