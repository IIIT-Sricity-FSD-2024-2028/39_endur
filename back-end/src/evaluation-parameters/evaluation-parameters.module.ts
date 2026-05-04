import { Module } from '@nestjs/common';
import { EvaluationParametersController } from './evaluation-parameters.controller';
import { EvaluationParametersService } from './evaluation-parameters.service';

@Module({
  controllers: [EvaluationParametersController],
  providers: [EvaluationParametersService],
  exports: [EvaluationParametersService],
})
export class EvaluationParametersModule {}
