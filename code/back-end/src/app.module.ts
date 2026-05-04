import { Module } from '@nestjs/common';
import { SeedModule } from './seed/seed.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CoursesModule } from './courses/courses.module';
import { FeedbackCyclesModule } from './feedback-cycles/feedback-cycles.module';
import { EvaluationParametersModule } from './evaluation-parameters/evaluation-parameters.module';
import { FeedbackResponsesModule } from './feedback-responses/feedback-responses.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { FacultyReportsModule } from './faculty-reports/faculty-reports.module';
import { DepartmentsModule } from './departments/departments.module';


@Module({
  imports: [
    SeedModule,   // Global — provides SeedService + DataStoreService to all modules
    AuthModule,
    UsersModule,
    CoursesModule,
    FeedbackCyclesModule,
    EvaluationParametersModule,
    FeedbackResponsesModule,
    AuditLogsModule,
    FacultyReportsModule,
    DepartmentsModule,

  ],
})
export class AppModule {}
