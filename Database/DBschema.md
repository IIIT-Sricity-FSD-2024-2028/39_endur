# Project ENDUR  
## Performance Review & Feedback Management System  
### Entity–Relationship Documentation

---

# 1. Strong Entities

Strong entities have their own primary key and exist independently.

---

## 1. Department
**Primary Key:** `department_id`

**Attributes**
- department_id (PK)
- name
- hod_faculty_id (FK → FacultyMember)

**Description**
Represents academic departments within the institution.

---

## 2. FacultyMember
**Primary Key:** `faculty_id`

**Attributes**
- faculty_id (PK)
- name
- email
- department_id (FK → Department)

**Description**
Stores faculty details who teach courses and receive feedback.

---

## 3. Student
**Primary Key:** `student_id`

**Attributes**
- student_id (PK)
- name
- email
- batch_year

**Description**
Represents students who submit feedback.

---

## 4. CourseOffering
**Primary Key:** `offering_id`

**Attributes**
- offering_id (PK)
- course_code
- course_name
- academic_year
- semester
- faculty_id (FK → FacultyMember)

**Description**
Represents a course taught by a faculty member in a specific semester.

---

## 5. FeedbackCycle
**Primary Key:** `cycle_id`

**Attributes**
- cycle_id (PK)
- cycle_name
- start_timestamp
- end_timestamp
- is_active
- cycle_type

**Description**
Defines the period during which feedback collection occurs.

---

## 6. EvaluationParameter
**Primary Key:** `parameter_id`

**Attributes**
- parameter_id (PK)
- parameter_name
- category
- description

**Description**
Defines criteria used for evaluating faculty performance.

---

# 2. Associative / Transactional Entities

These entities represent interactions between core entities.

---

## 7. FeedbackResponse
**Primary Key:** `response_id`

**Attributes**
- response_id (PK)
- cycle_id (FK → FeedbackCycle)
- offering_id (FK → CourseOffering)
- submission_timestamp
- is_flagged

**Description**
Represents a single feedback response submitted during a cycle for a course.

---

## 8. StudentSubmissionLog
**Primary Key:** `log_id`

**Attributes**
- log_id (PK)
- student_id (FK → Student)
- cycle_id (FK → FeedbackCycle)
- offering_id (FK → CourseOffering)

**Description**
Tracks which student submitted feedback for which course and cycle.

---

## 9. SelfReflection
**Primary Key:** `reflection_id`

**Attributes**
- reflection_id (PK)
- faculty_id (FK → FacultyMember)
- offering_id (FK → CourseOffering)
- cycle_id (FK → FeedbackCycle)
- reflection_notes
- submission_date

**Description**
Faculty reflection submitted after reviewing feedback.

---

## 10. ActionReport
**Primary Key:** `report_id`

**Attributes**
- report_id (PK)
- faculty_id (FK → FacultyMember)
- offering_id (FK → CourseOffering)
- cycle_id (FK → FeedbackCycle)
- improvement_plan
- submission_date
- is_read_only

**Description**
Faculty improvement plans based on feedback analysis.

---

## 11. ReviewCheckIn
**Primary Key:** `checkin_id`

**Attributes**
- checkin_id (PK)
- faculty_id (FK → FacultyMember)
- hod_id (FK → FacultyMember)
- offering_id (FK → CourseOffering)
- meeting_date
- discussion_notes
- status

**Description**
Meeting records between faculty and Head of Department.

---

## 12. ReviewOfReviews
**Primary Key:** `ror_id`

**Attributes**
- ror_id (PK)
- cycle_id (FK → FeedbackCycle)
- submitter_role
- feedback_text
- submission_timestamp

**Description**
Administrative feedback on the entire review process.

---

# 3. Weak Entities

Weak entities depend on a parent entity for existence.

---

## 13. PerformanceScore
**Primary Key:** `score_id`

**Attributes**
- score_id (PK)
- response_id (FK → FeedbackResponse)
- parameter_id (FK → EvaluationParameter)
- numeric_rating
- applied_weight

**Description**
Stores numerical ratings given for each evaluation parameter.

**Owner Entity:** FeedbackResponse

---

## 14. QualitativeFeedback
**Primary Key:** `comment_id`

**Attributes**
- comment_id (PK)
- response_id (FK → FeedbackResponse)
- comment_text

**Description**
Stores textual comments associated with a feedback response.

**Owner Entity:** FeedbackResponse

---

## 15. ComplianceAudit
**Primary Key:** `audit_id`

**Attributes**
- audit_id (PK)
- response_id (FK → FeedbackResponse)
- violation_type
- justification_note
- flagged_timestamp

**Description**
Tracks flagged feedback responses and compliance checks.

**Owner Entity:** FeedbackResponse

---

# 4. Entity Relationships

---

## Department Relationships

Department **1 — N** FacultyMember  
One department contains multiple faculty members.

Department **1 — 1** FacultyMember (HOD)  
Each department has one faculty member acting as HOD.

---

## Faculty Relationships

FacultyMember **1 — N** CourseOffering  
One faculty teaches multiple course offerings.

FacultyMember **1 — N** SelfReflection  

FacultyMember **1 — N** ActionReport  

FacultyMember **1 — N** ReviewCheckIn

---

## Student Relationships

Student **1 — N** StudentSubmissionLog  

Students can submit feedback for multiple courses.

---

## Course Relationships

CourseOffering **1 — N** FeedbackResponse  

CourseOffering **1 — N** StudentSubmissionLog  

CourseOffering **1 — N** SelfReflection  

CourseOffering **1 — N** ActionReport  

---

## Feedback Cycle Relationships

FeedbackCycle **1 — N** FeedbackResponse  

FeedbackCycle **1 — N** StudentSubmissionLog  

FeedbackCycle **1 — N** ReviewOfReviews  

---

## Feedback Response Relationships

FeedbackResponse **1 — N** PerformanceScore  

FeedbackResponse **1 — N** QualitativeFeedback  

FeedbackResponse **1 — N** ComplianceAudit  

---

# 5. Summary of Entity Types

| Type | Entities |
|-----|------|
| Strong Entities | Department, FacultyMember, Student, CourseOffering, FeedbackCycle, EvaluationParameter |
| Associative Entities | FeedbackResponse, StudentSubmissionLog, SelfReflection, ActionReport, ReviewCheckIn, ReviewOfReviews |
| Weak Entities | PerformanceScore, QualitativeFeedback, ComplianceAudit |

---
