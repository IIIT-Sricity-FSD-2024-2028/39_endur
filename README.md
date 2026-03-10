# 🟦 Endur
### Performance Review & Feedback Management System
#### [Jira Link](https://endur.atlassian.net/jira/software/projects/END/boards/1)

## 🟥 Problem Statement
Academic institutions rely on student feedback to evaluate teaching effectiveness and improve learning outcomes. However, traditional performance review systems suffer from structural and behavioral limitations that reduce their impact and credibility.


--- 

## 🟨 Key Challenges

- **Low Student Participation:**
The primary challenge, as lengthy and repetitive feedback forms result in participation rates reaching a ceiling of just 30%.

- **Delayed Feedback:**
Feedback is typically collected only at the end of the semester, making it ineffective for improving teaching for the current batch of students.

- **Bias & Revenge Ratings:**
Feedback submitted after grade publication is often influenced by grades rather than actual teaching quality.

- **Lack of Structured Follow-Through:**
Faculty receive scores but lack formal mechanisms for reflection and analysis attuned to their batches.

- **Limited Administrative Insight:**
Existing systems do not support long-term or institution-wide performance analysis.

---

## 🟩 System Objective

### Endur aims to provide a continuous, anonymized, and role-based feedback system that enables:

- Timely and lightweight feedback collection

- Meaningful faculty reflection and improvement planning

- Department-level and institution-wide oversight

--- 

## 🟪 Identified Actors & Planned Features

### 🧑‍🎓 Student

**Role:** Primary provider of feedback and participant in evaluating the feedback process.

#### **Planned Features:** 

- Submit multiple engaging feedbacks during active FeedbackCycles.

- Participate in multiple FeedbackCycles within a semester for continuous improvement.

- Guaranteed anonymity; student identity is never exposed or inferable.

- View history of personal feedback submissions for transparency.

- Submit feedback for Review of Reviews to evaluate the feedback system itself.

- Restricted from submitting feedback outside active FeedbackCycles.

---

### 🧑‍🏫 Faculty Member

**Role:** Subject of feedback and participant in continuous improvement.

#### **Planned Features:**

- Submit Self-Reflection before viewing student feedback.

- View Anonymized Reports after FeedbackCycle closure.

- Submit Action Reports when performance gaps exceed defined thresholds.

- Participate in ReviewCheckIns with the Head of Department.

- Track long-term improvement trends across semesters.

- All submitted reflections, reports, and action plans are immutable once finalized.

**Analyze through:**

- PerformanceScores

- GapAnalysis

- FeedbackTrends across cycles

---

### 🧑‍💼 Head of Department (HOD)

**Role:** Department-level reviewer and academic supervisor.

#### **Planned Features:**

- View aggregated performance reports for faculty in their department.

- Conduct ReviewCheckIns with faculty members.

- Define and manage EvaluationParameters for each FeedbackCycle.

- Monitor department-wide performance trends over time.

- Are automatically restricted from reviewing their own performance if also a faculty member.

**Review through:**

- FeedbackTrends

- GapAnalysis

- ActionReports

---

### 🧑‍⚖️ Dean

**Role:** Institutional oversight and conflict-resolution authority.

#### **Planned Features:**

- View institution-wide aggregated performance reports.

- Track long-term FeedbackTrends across academic years.

- Review ActionReports and ReviewCheckIn records from any department.

- Act as approving authority in conflict-of-interest scenarios.

- Freeze or invalidate FeedbackCycles in exceptional cases.

- Access ComplianceAudit logs while preserving student anonymity.

---

### 🛠️ System Administrator (Admin)

**Role:** Technical and operational manager of the system.

#### **Planned Features:**

**Configure:**

- FeedbackCycles

- EvaluationParameters

- Attendance-based weighting rules

- Manage user roles and access permissions.

**Enforce:**

- Immutability

- Auditability

- Privacy constraints

- Ensure system scalability and availability during peak usage.

---
---
