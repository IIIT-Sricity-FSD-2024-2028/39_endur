# Software Requirements Specification (SRS)

> [!info] Document Meta
> **Project:** Endur (Performance Review & Feedback Management System)
> **Team:** 39_endur
> **Version:** 1.01

---

## 1. Preface

### 1.1 Expected Readership
This document is intended for:
- **Project Developers (Team 39_endur):** To understand the technical specifications and constraints.
- **Domain Expert (Dean of Academics):** To validate that the operational workflows match university policy.
- **Project Evaluators:** To assess the depth of requirement analysis and system modeling.

### 1.2 Version History

| Version | Date | Description | Author |
| :--- | :--- | :--- | :--- |
| 1.00 | 2026-01-30 | Initial Draft based on Dean's Interview | Team 39_endur |
| 1.01 | 2026-01-31 | Refined system requirments| Team 39_endur |

---

## 2. Introduction

### 2.1 Need for the System
The current end-semester feedback model fails on two critical fronts:

> [!failure] Pain Point 1: Timing Latency
> Feedback arrives too late to benefit the current batch and is often skewed by "Revenge Ratings" submitted after grades are released.

> [!failure] Pain Point 2: Engagement Fatigue
> The Dean reports that **only ~30% of students participate** because the process is viewed as a "chore" rather than a meaningful contribution.

### 2.2 System Functions
- **Continuous Feedback Cycles:** Allows multiple review windows per semester.
- **Role-Based Dashboards:** Distinct views for Student (Submission), Faculty (Reflection), and HOD (Oversight).
- **Gap Analysis:** Automated comparison between Faculty Self-Reflection and Student Perception.
- **Anonymity Preservation:** Decoupling of student identity from feedback data.

### 2.3 Business & Strategic Objectives
> [!success] Our aim is to design a performance review and feedback system for an academic institution

---

## 3. Glossary
*Refer to [[definitions]] in the repository for the complete Ubiquitous Language.*

- **FeedbackCycle:** A defined, time-bound period for data collection.
- **GapAnalysis:** The quantitative difference between a professor's self-rating and the students' average rating.
- **AnonymizedReport:** A generated view where student identities are stripped to ensure psychological safety.
- **ActionReport:** A formal plan submitted by faculty to the HOD to address performance gaps.
- **ReviewOfReviews** A meta-evaluation process accessible to both students and faculty members that assesses the effectiveness, fairness, and usefulness of the feedback system itself, including question design and timing.
- **FeedbackTrend:** A longitudinal view of PerformanceScores across multiple FeedbackCycles,used to evaluate improvement, stagnation, or decline over time.
- **SelfReflection:** A reflective input provided to a FacultyMember and Student to assess their own performance,challenges, and improvements during a semester.
- **ReviewCheckIn:** A scheduled, lightweight review interaction between a FacultyMember and the DepartmentHead (or academic reviewer) focused on discussing feedback trends, gap analysis, and progress on previously committed action items,rather than re-evaluating raw scores.

- **FeedbackResponse:** A single, immutable submission made by a Student during a FeedbackCycle for a specific CourseOffering, consisting of PerformanceScores mapped to EvaluationParameters.Each FeedbackResponse represents one complete feedback instance and is used as an atomic unit for aggregation, analysis, and auditing.

---

## 4. User Requirements Definition
*High-level services provided for the user, described in natural language.*

### 4.1 Student Services
- **UR-01:** Students shall be able to submit  weekly/monthly FeedbackCycle which are lightweight (taking < 30 seconds) to ensure high participation.
- **UR-02:** Students shall be able to view a history of their past submissions for transparency.
- **UR-03:** Students should be able to fill monthly feedback form on ReviewOfReviews.

### 4.2 Faculty Services
- **UR-04:** Faculty shall be able to submit a **Self-Reflection** assessment before viewing student feedback.
- **UR-05:** Faculty shall be able to view their performance and FeedbackTrends.
- **UR-06:** Faculty shall be able to submit an **Action Report** if their performance scores trigger a system alert.

### 4.3 Administrative (HOD) Services
- **UR-07:** The Department Head (HOD) shall be able to view aggregated reports for all faculty members in their departments.
- **UR-08:** The HOD shall be able to conduct ReviewCheckIn with the concerned faculty members.
- **UR-09:** The HOD is able to define EvaluationParameter for every FeedbackCycle.

---

## 5. System Architecture
*High-level overview of system modules.*

The system follows a **Three-Tier Architecture**:
1. **Presentation Layer (Frontend)**
2. **Application Layer (Backend)**
3. **Data Layer (Database)**

---

## 6. System Requirements Specification
*Detailed technical requirements and constraints.*

### 6.1 Functional Requirements (FR)

**FR-01:** FeedbackCycle Window Enforcement
The system shall enforce FeedbackCycle submission boundaries based on configured start and end timestamps.

* Feedback submission requests received before `FeedbackCycle.startTimestamp` or after `FeedbackCycle.endTimestamp` shall be rejected.
* Rejected submissions shall return a validation error indicating that the FeedbackCycle is inactive.
* Enforcement shall apply uniformly across all FeedbackCycle types.

---

**FR-02:** Attendance-Weighted PerformanceScore Calculation
The system shall calculate PerformanceScore using AttendanceWeightedFeedback when attendance data is available for a CourseOffering.

* If student attendance exceeds 75%, the applied weight shall be 1.0.
* Attendance thresholds and corresponding weights shall be configurable.
* If attendance data is unavailable, unweighted averaging shall be applied.
* Weighting logic shall be applied per EvaluationParameter.

---

**FR-03:** GapAnalysis Computation 
The system shall compute GapAnalysis for each EvaluationParameter where both SelfReflection and student feedback exist.

* Gap shall be calculated as:  
  `Gap = |SelfReflection.Score - Average(Student PerformanceScore)|`
* GapAnalysis shall not modify underlying PerformanceScores.

---

**FR-04:** ActionReport Immutability
The system shall enforce immutability of ActionReports after submission.

* Once submitted, an ActionReport shall become read-only to the FacultyMember.
* Editing, deletion, or overwriting of a submitted ActionReport shall not be permitted.
* A new ActionReport may only be submitted in a subsequent FeedbackCycle.
* DepartmentHead access to ActionReports shall be read-only.

---

**FR-05:** AnonymizedReport Generation
The system shall generate AnonymizedReports for each FacultyMember and CourseOffering after the closure of a FeedbackCycle.

* AnonymizedReports shall aggregate PerformanceScores per EvaluationParameter.
* Individual student identities and raw submissions shall not be exposed.
* QualitativeFeedback shall be grouped and anonymized before inclusion.
* AnonymizedReports shall be immutable once generated.

---

**FR-06:** FeedbackTrend Computation
The system shall compute FeedbackTrends across multiple FeedbackCycles for the same CourseOffering and FacultyMember.

* FeedbackTrends shall be based on aggregated PerformanceScores.
* Trends shall be calculated per EvaluationParameter.
* Historical FeedbackTrends shall not be recalculated when new cycles are added.
* FeedbackTrends shall not alter historical data.

---

**FR-07:** ComplianceAudit for Feedback Integrity
The system shall perform ComplianceAudit checks on feedback submissions to detect integrity violations.

* The system shall flag RandomTicking patterns, including:
  * Identical PerformanceScores across all EvaluationParameters
  * Multiple submissions within an unusually short time window
* Flagged submissions shall be excluded from PerformanceScore calculations.
* ComplianceAudit results shall be logged for administrative review.

---

**FR-08:** ReviewCheckIn Record Management
The system shall store ReviewCheckIn records associated with a FacultyMember and CourseOffering.

* ReviewCheckIn records shall reference:
  * Relevant FeedbackTrends
  * Associated GapAnalysis results
  * Related ActionReports
* ReviewCheckIn records shall be immutable once saved.

### 6.2 Non-Functional Requirements (NFR)

- **NFR-01** (Anonymity & Privacy):*  
  The system shall ensure that Student_ID is never retrievable, inferable, or reconstructible from any FeedbackResponse, AnonymizedReport, or downstream analytics store.

- **NFR-02** (Scalability):*  
  The system shall support a minimum of *500 concurrent write operations* within the final *10 minutes of an active FeedbackCycle* without data loss or degradation of response correctness.

- **NFR-03** (Availability):*  
  The system shall maintain *99.9% service availability* during institution-defined peak periods, including active exam weeks and FeedbackCycle submission windows.

- **NFR-04** (Immutability & Data Integrity):*  
  The system shall enforce immutability for all finalized artifacts, including submitted feedback responses, generated AnonymizedReports, ActionReports, and ReviewCheckIn records, such that no updates or deletions are permitted after persistence.

- **NFR-05** (Auditability):*  
  The system shall maintain an append-only audit log capturing all create and state-transition events related to FeedbackCycles, feedback submissions, ActionReports, and administrative actions, with timestamps and actor roles recorded.

## 6.3 Domain Requirements (DR)

The following domain requirements define mandatory constraints that govern system behavior to ensure fairness, privacy, and academic integrity.

---

### DR-01: Revenge Rating Prevention (Temporal Constraint)

**Constraint:**  
- The system must strictly enforce that all FeedbackCycles for a given semester are **closed and locked** before the official publication of semester grades.

**Rationale:**  
- Academic research indicates a strong correlation between low grades and negative feedback (“Revenge Ratings”).  
- Temporally decoupling grade publication from feedback submission ensures that evaluations reflect **teaching quality** rather than **grade satisfaction**.

---

### DR-02: Minimum Statistical Threshold

**Constraint:**  
- An AnonymizedReport shall **not be generated or displayed** for any CourseOffering where:
  - Fewer than **5 FeedbackResponses** have been submitted, **or**
  - Submissions represent **less than 10% of total enrollment**.

**Rationale:**  
- Small sample sizes increase the risk that “anonymized” feedback can be reverse-engineered to identify individual students based on writing style or unique complaints.  
- Enforcing a minimum threshold preserves the system’s **privacy guarantees**.

---

### DR-03: Role Conflict Resolution (Dual-Role Policy)

**Constraint:**  
- If a DepartmentHead is also a FacultyMember teaching a course, they **must not** be permitted to:
  - View, approve, or self-review their own ActionReports or ReviewCheckIns.  
- In such cases, approval authority shall be **automatically reassigned** to the Dean or a designated secondary administrator.

**Rationale:**  
- This prevents conflicts of interest in which an administrator effectively reviews and approves their **own performance improvement processes**.

---

### DR-04: Cooling Period (Anti-Spam Control)

**Constraint:**  
- The system shall not permit a new FeedbackResponse to be initiated for the same CourseOffering within **7 days** of the previous FeedbackCycle’s closure.

**Rationale:**  
- While continuous feedback is desirable, excessive frequency may lead to survey fautige.


---

## 7. System Models

### 7.1 Use Case Diagram
*Visualizing Student, Faculty, and HOD interactions.*

```mermaid
usecaseDiagram
    actor "Faculty Member" as F

    package "Faculty Performance Module" {
        usecase "Submit Self-Assessment" as UC_Self
        usecase "Analyze Performance Dashboard" as UC_Dashboard
        usecase "Submit Action Taken Report" as UC_Action
    }

    %% Main Workflows
    F --> UC_Self
    F --> UC_Dashboard

    %% The Logic (How the workflow flows)
    UC_Dashboard ..> UC_Self : <<include>>
    note right of UC_Dashboard : Includes Gap Analysis,\nStudent Ratings, & Trends.

    %% Closing the Loop
    UC_Action ..> UC_Dashboard : <<extend>>
    note bottom of UC_Action : If performance is low,\nfaculty submits an improvement plan.
````

### 7.2 Activity Diagram

_Detailing the "Gap Analysis" workflow._

_(Placeholder: Insert Activity Diagram Mermaid Code Here)_

### 7.3 Sequence Diagram

_Detailing the "Secure Submission" API flow._

_(Placeholder: Insert Sequence Diagram Mermaid Code Here)_

---

## 8. System Evolution

### 8.1 Assumptions

- Attendance data will be provided through **manual upload or administrative entry** in the initial version of the system.
- FeedbackCycles, EvaluationParameters, and thresholds will be **configured manually** by administrative users.
- All users (Students, FacultyMembers, DepartmentHeads) will authenticate using **institution-provided credentials**, without external identity providers.

---

### 8.2 Future Scope

- Integration with an official university attendance system, if and when a stable interface becomes available.
- Enhanced reporting for long-term FeedbackTrends across academic years.
- Improved administrative tools for ComplianceAudit analysis and review monitoring.

---

## 9. Appendices

---


## 10. Index

### A
- ActionReport
- AnonymizedReport
- AttendanceWeightedFeedback

### C
- ComplianceAudit
- CourseOffering

### F
- FacultyMember
- FeedbackCycle
- FeedbackResponse
- FeedbackTrend

### G
- GapAnalysis

### R
- ReviewCheckIn
- ReviewOfReviews

---
