---

# ENDUR: Database Schema

This document describes the database structure, tables, attributes, constraints, and relationships for the **ENDUR Performance Review & Feedback Management System**.

---

# Student

Stores student information for individuals who submit course feedback.

| Column Name    | Data Type    | Constraints      | Description                        |
| -------------- | ------------ | ---------------- | ---------------------------------- |
| **student_id** | VARCHAR(50)  | **PRIMARY KEY**  | Unique identifier for each student |
| **name**       | VARCHAR(100) | NOT NULL         | Student full name                  |
| **email**      | VARCHAR(100) | UNIQUE, NOT NULL | Institutional email                |
| **batch_year** | INT          | NOT NULL         | Year the student joined            |
| **program**    | VARCHAR(100) |                  | Academic program of the student    |

---

# FacultyMember

Stores faculty information for instructors teaching courses.

| Column Name     | Data Type    | Constraints      | Description                       |
| --------------- | ------------ | ---------------- | --------------------------------- |
| **faculty_id**  | VARCHAR(50)  | **PRIMARY KEY**  | Unique identifier for faculty     |
| **name**        | VARCHAR(100) | NOT NULL         | Faculty full name                 |
| **email**       | VARCHAR(100) | UNIQUE, NOT NULL | Institutional email               |
| **department**  | VARCHAR(100) |                  | Department the faculty belongs to |
| **designation** | VARCHAR(100) |                  | Faculty rank or position          |

---

# DepartmentHead

Represents faculty members serving as Heads of Department.

| Column Name            | Data Type    | Constraints                                 | Description                                  |
| ---------------------- | ------------ | ------------------------------------------- | -------------------------------------------- |
| **hod_id**             | INT          | **PRIMARY KEY, AUTO_INCREMENT**             | Unique identifier for department head record |
| **faculty_id**         | VARCHAR(50)  | **FOREIGN KEY → FacultyMember(faculty_id)** | Faculty member acting as HOD                 |
| **department_managed** | VARCHAR(100) |                                             | Department overseen by this HOD              |

---

# Dean

Represents faculty members serving administrative dean roles.

| Column Name    | Data Type   | Constraints                                 | Description                       |
| -------------- | ----------- | ------------------------------------------- | --------------------------------- |
| **dean_id**    | INT         | **PRIMARY KEY, AUTO_INCREMENT**             | Unique identifier for dean record |
| **faculty_id** | VARCHAR(50) | **FOREIGN KEY → FacultyMember(faculty_id)** | Faculty member serving as dean    |

---

# CourseOffering

Represents a course taught by a faculty member during a specific semester.

| Column Name     | Data Type    | Constraints                                 | Description                                |
| --------------- | ------------ | ------------------------------------------- | ------------------------------------------ |
| **offering_id** | INT          | **PRIMARY KEY, AUTO_INCREMENT**             | Unique identifier for course offering      |
| **course_name** | VARCHAR(100) |                                             | Name of the course                         |
| **course_code** | VARCHAR(20)  |                                             | Institutional course code                  |
| **semester**    | VARCHAR(20)  |                                             | Semester during which the course is taught |
| **faculty_id**  | VARCHAR(50)  | **FOREIGN KEY → FacultyMember(faculty_id)** | Faculty teaching this offering             |

---

# FeedbackCycle

Defines time periods during which feedback is collected.

| Column Name        | Data Type    | Constraints                     | Description                          |
| ------------------ | ------------ | ------------------------------- | ------------------------------------ |
| **cycle_id**       | INT          | **PRIMARY KEY, AUTO_INCREMENT** | Unique identifier for feedback cycle |
| **cycle_name**     | VARCHAR(100) |                                 | Name of the cycle                    |
| **start_datetime** | TIMESTAMP    |                                 | Feedback start time                  |
| **end_datetime**   | TIMESTAMP    |                                 | Feedback end time                    |
| **status**         | VARCHAR(50)  |                                 | Status of the cycle                  |

---

# EvaluationParameter

Defines evaluation criteria used to assess faculty performance.

| Column Name        | Data Type    | Constraints                     | Description                               |
| ------------------ | ------------ | ------------------------------- | ----------------------------------------- |
| **parameter_id**   | INT          | **PRIMARY KEY, AUTO_INCREMENT** | Unique identifier for parameter           |
| **parameter_name** | VARCHAR(100) |                                 | Name of evaluation parameter              |
| **description**    | TEXT         |                                 | Explanation of evaluation criteria        |
| **is_active**      | BOOLEAN      | DEFAULT TRUE                    | Whether the parameter is currently active |

---

# FeedbackResponse

Represents a single feedback submission from a student.

| Column Name              | Data Type    | Constraints                                   | Description                                        |
| ------------------------ | ------------ | --------------------------------------------- | -------------------------------------------------- |
| **response_id**          | INT          | **PRIMARY KEY, AUTO_INCREMENT**               | Unique feedback submission ID                      |
| **cycle_id**             | INT          | **FOREIGN KEY → FeedbackCycle(cycle_id)**     | Feedback cycle during which response was submitted |
| **offering_id**          | INT          | **FOREIGN KEY → CourseOffering(offering_id)** | Course offering being evaluated                    |
| **student_id**           | VARCHAR(50)  | **FOREIGN KEY → Student(student_id)**         | Student submitting the feedback                    |
| **submission_timestamp** | TIMESTAMP    | DEFAULT CURRENT_TIMESTAMP                     | Time feedback was submitted                        |
| **attendance_weight**    | DECIMAL(3,2) |                                               | Weight based on student attendance                 |

---

# PerformanceScore

Stores numerical ratings for evaluation parameters within a feedback response.

| Column Name        | Data Type    | Constraints                                         | Description                      |
| ------------------ | ------------ | --------------------------------------------------- | -------------------------------- |
| **score_id**       | INT          | **PRIMARY KEY, AUTO_INCREMENT**                     | Unique identifier for score      |
| **response_id**    | INT          | **FOREIGN KEY → FeedbackResponse(response_id)**     | Associated feedback response     |
| **parameter_id**   | INT          | **FOREIGN KEY → EvaluationParameter(parameter_id)** | Evaluation parameter being rated |
| **numeric_rating** | INT          | CHECK (1–10)                                        | Numeric rating value             |
| **applied_weight** | DECIMAL(3,2) |                                                     | Weight applied to the score      |

---

# QualitativeFeedback

Stores textual feedback comments from students.

| Column Name           | Data Type | Constraints                                     | Description                   |
| --------------------- | --------- | ----------------------------------------------- | ----------------------------- |
| **qualitative_id**    | INT       | **PRIMARY KEY, AUTO_INCREMENT**                 | Unique identifier for comment |
| **response_id**       | INT       | **FOREIGN KEY → FeedbackResponse(response_id)** | Associated feedback response  |
| **free_text_comment** | TEXT      |                                                 | Student written feedback      |

---

# ComplianceAudit

Tracks flagged feedback submissions for review.

| Column Name             | Data Type    | Constraints                                     | Description                           |
| ----------------------- | ------------ | ----------------------------------------------- | ------------------------------------- |
| **audit_id**            | INT          | **PRIMARY KEY, AUTO_INCREMENT**                 | Unique identifier for audit entry     |
| **response_id**         | INT          | **FOREIGN KEY → FeedbackResponse(response_id)** | Feedback response being audited       |
| **flag_reason**         | VARCHAR(200) |                                                 | Reason the feedback was flagged       |
| **flag_timestamp**      | TIMESTAMP    | DEFAULT CURRENT_TIMESTAMP                       | Timestamp of audit flag               |
| **is_valid_submission** | BOOLEAN      |                                                 | Indicates whether submission is valid |

---

# SelfReflection

Faculty reflections after reviewing feedback results.

| Column Name         | Data Type   | Constraints                                   | Description                   |
| ------------------- | ----------- | --------------------------------------------- | ----------------------------- |
| **reflection_id**   | INT         | **PRIMARY KEY, AUTO_INCREMENT**               | Unique reflection identifier  |
| **faculty_id**      | VARCHAR(50) | **FOREIGN KEY → FacultyMember(faculty_id)**   | Faculty submitting reflection |
| **offering_id**     | INT         | **FOREIGN KEY → CourseOffering(offering_id)** | Course offering evaluated     |
| **cycle_id**        | INT         | **FOREIGN KEY → FeedbackCycle(cycle_id)**     | Feedback cycle context        |
| **notes**           | TEXT        |                                               | Faculty reflection notes      |
| **submission_date** | TIMESTAMP   | DEFAULT CURRENT_TIMESTAMP                     | Reflection submission date    |

---

# ActionReport

Faculty improvement plans created based on feedback.

| Column Name            | Data Type   | Constraints                                   | Description                  |
| ---------------------- | ----------- | --------------------------------------------- | ---------------------------- |
| **action_id**          | INT         | **PRIMARY KEY, AUTO_INCREMENT**               | Unique action report ID      |
| **faculty_id**         | VARCHAR(50) | **FOREIGN KEY → FacultyMember(faculty_id)**   | Faculty preparing the report |
| **offering_id**        | INT         | **FOREIGN KEY → CourseOffering(offering_id)** | Course offering analyzed     |
| **planned_strategies** | TEXT        |                                               | Strategies for improvement   |
| **submission_date**    | TIMESTAMP   | DEFAULT CURRENT_TIMESTAMP                     | Date report was submitted    |

---

# GapAnalysis

Stores analysis identifying discrepancies between feedback perception and faculty self-assessment.

| Column Name                     | Data Type | Constraints                                     | Description                         |
| ------------------------------- | --------- | ----------------------------------------------- | ----------------------------------- |
| **gap_id**                      | INT       | **PRIMARY KEY, AUTO_INCREMENT**                 | Unique gap analysis ID              |
| **reflection_id**               | INT       | **FOREIGN KEY → SelfReflection(reflection_id)** | Related faculty reflection          |
| **action_id**                   | INT       | **FOREIGN KEY → ActionReport(action_id)**       | Associated action report            |
| **perception_difference_notes** | TEXT      |                                                 | Notes on perception differences     |
| **identified_blind_spots**      | TEXT      |                                                 | Areas where improvements are needed |

---

# ReviewOfReviews

Feedback provided about the review process itself.

| Column Name              | Data Type   | Constraints                               | Description                                |
| ------------------------ | ----------- | ----------------------------------------- | ------------------------------------------ |
| **ror_id**               | INT         | **PRIMARY KEY, AUTO_INCREMENT**           | Unique review identifier                   |
| **submitted_by_user_id** | VARCHAR(50) |                                           | Identifier of the user submitting feedback |
| **cycle_id**             | INT         | **FOREIGN KEY → FeedbackCycle(cycle_id)** | Cycle being evaluated                      |
| **process_feedback**     | TEXT        |                                           | Feedback about the review process          |
| **submission_date**      | TIMESTAMP   | DEFAULT CURRENT_TIMESTAMP                 | Submission timestamp                       |

---

# AnonymizedReport

Summarized feedback reports provided to faculty.

| Column Name           | Data Type | Constraints                                   | Description                      |
| --------------------- | --------- | --------------------------------------------- | -------------------------------- |
| **report_id**         | INT       | **PRIMARY KEY, AUTO_INCREMENT**               | Unique report identifier         |
| **cycle_id**          | INT       | **FOREIGN KEY → FeedbackCycle(cycle_id)**     | Feedback cycle summarized        |
| **offering_id**       | INT       | **FOREIGN KEY → CourseOffering(offering_id)** | Course offering being summarized |
| **aggregated_scores** | TEXT      |                                               | Aggregated evaluation scores     |
| **grouped_comments**  | TEXT      |                                               | Grouped anonymous comments       |
| **generation_date**   | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP                     | Report generation date           |

**Constraint**

UNIQUE (cycle_id, offering_id)

Ensures only one anonymized report exists per course offering per feedback cycle.

---

# ReviewCheckIn

Meetings between faculty and department heads reviewing improvement plans.

| Column Name          | Data Type   | Constraints                                 | Description                   |
| -------------------- | ----------- | ------------------------------------------- | ----------------------------- |
| **checkin_id**       | INT         | **PRIMARY KEY, AUTO_INCREMENT**             | Unique meeting identifier     |
| **faculty_id**       | VARCHAR(50) | **FOREIGN KEY → FacultyMember(faculty_id)** | Faculty member involved       |
| **hod_id**           | INT         | **FOREIGN KEY → DepartmentHead(hod_id)**    | HOD conducting the review     |
| **meeting_date**     | DATE        |                                             | Date of the meeting           |
| **discussion_notes** | TEXT        |                                             | Notes recorded during meeting |
| **action_id**        | INT         | **FOREIGN KEY → ActionReport(action_id)**   | Related action report         |

---
