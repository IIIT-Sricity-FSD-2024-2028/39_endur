import { Module } from '@nestjs/common';
import { FacultyReportsController } from './faculty-reports.controller';
import { FacultyReportsService } from './faculty-reports.service';

@Module({
  controllers: [FacultyReportsController],
  providers: [FacultyReportsService]
})
export class FacultyReportsModule {}
