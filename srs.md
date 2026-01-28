
---

# Software Requirements Specification (SRS)

**Project Name:** Endur (Performance Review & Feedback Management System)

**Team:** 39_endur

## 1. Preface

### 1.1 Purpose

The purpose of this document is to define the user and system requirements for the **Endur** Performance Review System. It describes the functional and non-functional requirements, interfaces, and constraints to guide the development and testing phases.

### 1.2 Scope

**Endur** is a web-based application designed to facilitate anonymous, standardized, and time-bound feedback from students to faculty members. It allows Department Heads (HODs) to oversee academic performance through data analytics while ensuring student anonymity.

### 1.3 Version History

| Version | Date | Description | Author |
| --- | --- | --- | --- |
| 1.0 | 2026-01-28 | Initial Draft of SRS | Team 39_endur |

---

## 2. Introduction

### 2.1 Need for the System

Current manual feedback systems or disparate Google Forms are inefficient, prone to bias, difficult to analyze, and lack strict anonymity. A dedicated system is required to standardize evaluation metrics (1-10 scale), enforce submission windows, and visualize teaching trends over time.

### 2.2 Product Functions

* **Role-Based Access Control (RBAC):** Automatic role detection for Student, Professor, and HOD.
* **Feedback Collection:** Time-sensitive forms with numeric ratings and comments.
* **Analytics Engine:** Aggregates scores and generates line charts for trend analysis.
* **Administrative Dashboard:** Provides oversight of department-level performance.

---

## 3. Glossary

*Refer to `definitions.yml` in the repository for the complete Ubiquitous Language.*

* **FeedbackCycle:** The specific time window for submissions.
* **EvaluationParameter:** The criteria used for rating (e.g., Punctuality).
* **AnonymizedReport:** The output viewable by professors stripping student identity.

---

## 4. User Requirements Definition

*This section describes the services provided for the user.*

### 4.1 Student Services

* **UR-01:** The student shall be able to view a list of eligible professors based on their registered Year, Section, and Department.
* **UR-02:** The student shall be able to submit numeric ratings and comments only within the active FeedbackCycle.
* **UR-03:** The student shall be able to view their own history of submitted feedback.

### 4.2 Professor Services

* **UR-04:** The professor shall receive alerts when a new feedback cycle is completed.
* **UR-05:** The professor shall view average ratings and anonymized comments per EvaluationParameter.
* **UR-06:** The professor shall view performance trends across semesters via line charts.

### 4.3 HOD Services

* **UR-07:** The HOD shall view aggregated ratings for all professors in the department.
* **UR-08:** The HOD shall receive flags for consistently high or low-performing professors.
* **UR-09:** The HOD shall be able to add new categories (EvaluationParameters) to the feedback form.

---

## 5. System Architecture

*High-level overview of the distribution of functions.*

* **Frontend Module:** React.js based interface for users to interact with forms and dashboards.
* **Backend Module:** Node.js/Express server handling API requests, authentication, and business logic (locking forms, calculating averages).
* **Database Module:** Relational database (SQL) storing User Data, Feedback Records, and Course Mappings.
* **Analytics Service:** A logical component that processes raw ratings into averaged reports and visualizations.

---

## 6. System Requirements Specification

*Detailed functional and non-functional requirements.*

### 6.1 Functional Requirements

**FR-01: Authentication & Authorization**

* The system shall authenticate users via secure login.
* The system shall automatically determine the user's role (Student, Professor, HOD) upon login.

**FR-02: Feedback Management**

* The system shall lock feedback submissions automatically when the deadline passes.
* The system shall prevent modification of feedback after submission (Immutability).
* The system shall validate that all mandatory rating fields are filled before acceptance.

**FR-03: Reporting & Visualization**

* The system shall calculate the arithmetic mean of ratings for each category.
* The system shall mask student IDs in all reports generated for Professors and HODs.
* The system shall generate graphical line charts comparing current semester ratings against previous semesters.

### 6.2 Non-Functional Requirements

**NFR-01: Anonymity (Security)**

* The system must ensure that a Professor can never trace a specific rating or comment back to an individual student account.

**NFR-02: Data Integrity**

* Feedback records must be immutable (read-only) once committed to the database.

**NFR-03: Performance**

* The system must support concurrent logins from all students in a department during the active feedback window without crashing.

---

## 7. System Models

*(Placeholders for UML Diagrams to be added)*

* **7.1 Use Case Diagram:** *Shows actors (Student, Prof, HOD) and their interactions.*
* **7.2 Activity Diagram:** *Shows the flow of the Feedback Submission process.*
* **7.3 Sequence Diagram:** *Shows the API calls between Frontend, Backend, and Database during Login/Submission.*

---

## 8. System Evolution

*Assumptions and future changes.*

### 8.1 Future Features

* **Draft Mode:** Ability for students to save feedback as drafts before submitting.
* **Sentiment Analysis:** Implementation of ML models to summarize qualitative comments into a single paragraph.
* **Audit Logs:** Advanced logging to track submission timestamps for suspicious activity analysis.
* **Report Export:** Capability to download feedback reports as PDF/CSV.

---
