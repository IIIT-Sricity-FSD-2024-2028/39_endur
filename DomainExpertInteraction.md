# Summary of the interaction

## Basic information
    Domain: Human Resource & Staff Administration
    Problem statement: Performance Review & Feedback Management System
    Date of interaction:29th January 2026
    Mode of interaction: Video Call
    Duration (in-minutes): 33 minutes
    Publicly accessible Video link: https://drive.google.com/file/d/1q-V_3gdyo2aMbwW8RlCTPU0yLqQjsbtI/view?usp=sharing

## Domain Expert Details
    Domain Expert: Dr. Hrishikesh Venkataraman (Dean of Academics) 
    Experience in the domain : As served as a professor from IIIT Sri City beginning from 2015, overseeing the collection, analysis, and application of academic feedback to ensure continuous improvement in teaching quality, curriculum effectiveness, and student learning outcomes.
    Nature of work: Managerial

## Domain Context and Terminology

- How would you describe the overall purpose of this problem statement in your daily work?
- **Answer:** 
The purpose of this problem statement is to design a more effective, timely, and engaging faculty feedback system that helps institutions improve course content and teaching delivery, rather than merely collecting end-semester scores that rarely lead to action.

- What are the primary goals or outcomes of this problem statement?
- **Answer:** 
Make feedback enjoyable and engaging for students
Collect continuous, interval-based feedback instead of one-time semester feedback
Increase quality and honesty of feedback, not just numeric ratings
Enable faculty to view trends, summaries, and anonymized comments without access to individual student identities

- List key terms used by the domain expert and their meanings

| Term                       | Meaning as explained by the expert                                                                                                        |
|             ---            |                                                         ---                                                                               |
| FeedbackCycle              | A fixed window during the semester when students are allowed to submit feedback to enable continuous reviews.                             |
| EvaluationParameter        | Specific aspects of teaching that are evaluated, such as clarity, pace, responsiveness, and course relevance.                             |
| CourseContentQuality       | How relevant, structured, and useful the course material is for student progression and future application.                               |
| PerformanceScore           | A numeric score assigned to an evaluation parameter, mainly used to observe trends over time rather than judge faculty once.              |
| QualitativeFeedback        | Written comments from students that explain scores, highlight strengths, or point out improvement areas.                                  |
| AnonymizedReport           | An aggregated faculty-facing report where student identities and raw submissions are hidden, but trends and grouped comments are visible. |
| FeedbackTrend              | A time-based view of how a faculty member’s scores change across feedback cycles in a semester.                                           |
| AttendanceWeightedFeedback | A mechanism where feedback from low-attendance students has reduced influence on final evaluation.                                        |
| SelfReflection             | A self-assessment provided by faculty (and in some cases students) describing expected performance and perceived effectiveness.           |
| GapAnalysis                | The difference between what faculty expected based on self-reflection and what students actually reported in feedback.                    |
| ActionReport               | A report submitted by faculty to the HOD describing concrete steps they will take in future courses based on feedback and gaps.           |
| ReviewCheckIn              | A structured discussion between faculty and HOD focused on trends, gaps, and progress on action items.                                    |
| ReviewOfReviews            | A review of the feedback system itself to check if questions, timing, and process are working effectively.                                |
| RandomTicking              | A failure pattern where students submit feedback without reading questions, leading to unreliable data.                                   |

## Actors and Responsibilities
- Identify the different roles involved and what they do in practice.
- **Answer:** 
The domain involves students providing feedback, faculty reflecting and improving their teaching, and academic leadership reviewing trends and guiding improvement while maintaining fairness and anonymity.

| Actor / Role              | Responsibilities                                                                                                         |
|           ---             |                                                ---                                                                       |
| Student                   | Submits feedback during open feedback cycles, providing scores and optional comments based on classroom experience.      |
| FacultyMember             | Reviews anonymized feedback trends, performs self-reflection, identifies gaps, and submits action plans for improvement. |
| DepartmentHead            | Reviews aggregated reports, conducts review check-ins, calibrates interpretations, and supports faculty improvement.     |
| Academic Reviewer / Admin | Manages feedback cycles, audits integrity, and ensures rules around anonymity and timing are enforced.                   |
| Institutional Leadership  | Oversees the overall effectiveness of the feedback and review process and approves process-level changes.                |


## Core workflows

### Workflow 1: Continuous Student Feedback Collection
- **Trigger / Start Condition**
  - A FeedbackCycle opens during the semester.
- **Steps**
  1. System opens feedback window for eligible courses.
  2. Students submit PerformanceScores and QualitativeFeedback about EvaluationParameter and CourseContentQuality.
  3. ComplianceAudit monitors for abnormal patterns (e.g., RandomTicking).
  4. Feedback is stored without exposing student identity via AnonymizedReport.
- **Outcome / End Condition**
  - FeedbackCycle closes and submissions are locked.

### Workflow 2: Faculty Review and Reflection
- **Trigger / Start Condition**
  - A FeedbackCycle ends and reports are generated.
- **Steps**
  1. Faculty completes SelfReflection for the course.
  2. Faculty views AnonymizedReport and FeedbackTrends.
  3. System generates GapAnalysis comparing expectations vs feedback.
- **Outcome / End Condition**
  - Faculty gains clarity on strengths and improvement areas.

### Workflow 3: Improvement Planning and Review
- **Trigger / Start Condition**
  - Significant gaps or consistent trends are identified.
- **Steps**
  1. Faculty prepares an ActionReport outlining planned improvements.
  2. ActionReport is submitted to the DepartmentHead.
  3. ReviewCheckIn is conducted to discuss feasibility and progress.
  4. Notes may feed into future ReviewOfReviews.
- **Outcome / End Condition**
  - Agreed improvement actions are tracked into the next FeedbackCycle.


## Rules, Constraints, and Exceptions

### Mandatory rules or policies
- Feedback must be anonymous at the student level.
- Feedback submission is only allowed during defined FeedbackCycles.

### Constraints or limitations
- Attendance-based weighting can only be applied when attendance data is available, i.e, for the end-sem feedback form.
- Feedback frequency must be limited to avoid spamming.
- Course type affects how scores are interpreted.

### Common exceptions or edge cases
- Seed courses naturally receiving lower scores.
- Small class sizes skewing averages.
- Different batches might have different students, so comparing across semesters is not a very useful metric.
- Students submitting minimal or identical ratings.

### Situations where things usually go wrong
- Random ticking reducing feedback quality.
- Feedback reviewed too late to impact the ongoing course.
- ActionReports becoming formalities instead of real plans.

## Current challenges and pain points
- Feedback often feels like a chore for students.
- Numerical scores lack sufficient context without comments.
- Faculty may not see improvement trends clearly.
- Review discussions happen inconsistently.
- Difficult to fairly compare courses of different types or sizes.

## Assumptions & Clarifications

### Assumptions confirmed
- Teaching delivery matters more than subject knowledge in most cases.
- Continuous feedback is more useful than one-time reviews.
- Anonymity is essential for honest feedback.

### Assumptions corrected
- More feedback entries do not automatically mean better insights.
- End-term reviews alone are sufficient.
- Numeric scores alone can drive improvement.

### Open questions that need follow-up
- How many feedback cycles per semester are optimal?
- When should ActionReports be mandatory?
- How much weight should attendance realistically have?
- How can ReviewOfReviews be made actionable rather than symbolic?
