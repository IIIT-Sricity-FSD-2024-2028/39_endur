import { Module } from '@nestjs/common';
import { FeedbackResponsesController } from './feedback-responses.controller';
import { FeedbackResponsesService } from './feedback-responses.service';

@Module({
  controllers: [FeedbackResponsesController],
  providers: [FeedbackResponsesService],
  exports: [FeedbackResponsesService],
})
export class FeedbackResponsesModule {}
