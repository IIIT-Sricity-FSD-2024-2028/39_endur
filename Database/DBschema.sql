DROP DATABASE IF EXISTS endur_db;
CREATE DATABASE endur_db;
\c endur_db;

CREATE TABLE Department (
    department_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE FacultyMember (
    faculty_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    department_id INT REFERENCES Department(department_id)
);

ALTER TABLE Department 
ADD COLUMN hod_faculty_id VARCHAR(50) REFERENCES FacultyMember(faculty_id);

CREATE TABLE Dean (
    dean_id SERIAL PRIMARY KEY,
    faculty_id VARCHAR(50) UNIQUE REFERENCES FacultyMember(faculty_id),
    office_tenure VARCHAR(50)
);

CREATE TABLE Student (
    student_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    batch_year INT NOT NULL
);

CREATE TABLE CourseOffering (
    offering_id SERIAL PRIMARY KEY,
    course_code VARCHAR(20) NOT NULL,
    course_name VARCHAR(100) NOT NULL,
    academic_year VARCHAR(10) NOT NULL,
    semester VARCHAR(20) NOT NULL,
    faculty_id VARCHAR(50) REFERENCES FacultyMember(faculty_id)
);

CREATE TABLE FeedbackCycle (
    cycle_id SERIAL PRIMARY KEY,
    cycle_name VARCHAR(100) NOT NULL,
    start_timestamp TIMESTAMP NOT NULL,
    end_timestamp TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    cycle_type VARCHAR(50)
);

CREATE TABLE EvaluationParameter (
    parameter_id SERIAL PRIMARY KEY,
    parameter_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT
);

CREATE TABLE FeedbackResponse (
    response_id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES FeedbackCycle(cycle_id) ON DELETE CASCADE,
    offering_id INT REFERENCES CourseOffering(offering_id) ON DELETE CASCADE,
    submission_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_flagged BOOLEAN DEFAULT FALSE
);

CREATE TABLE StudentSubmissionLog (
    log_id SERIAL PRIMARY KEY,
    student_id VARCHAR(50) REFERENCES Student(student_id),
    cycle_id INT REFERENCES FeedbackCycle(cycle_id),
    offering_id INT REFERENCES CourseOffering(offering_id),
    UNIQUE (student_id, cycle_id, offering_id)
);

CREATE TABLE PerformanceScore (
    score_id SERIAL PRIMARY KEY,
    response_id INT REFERENCES FeedbackResponse(response_id) ,
    parameter_id INT REFERENCES EvaluationParameter(parameter_id),
    numeric_rating INT NOT NULL CHECK (numeric_rating BETWEEN 1 AND 10),
    applied_weight DECIMAL(3,2) DEFAULT 1.0
);

CREATE TABLE QualitativeFeedback (
    comment_id SERIAL PRIMARY KEY,
    response_id INT REFERENCES FeedbackResponse(response_id) ,
    comment_text TEXT NOT NULL
);

CREATE TABLE SelfReflection (
    reflection_id SERIAL PRIMARY KEY,
    faculty_id VARCHAR(50) REFERENCES FacultyMember(faculty_id),
    offering_id INT REFERENCES CourseOffering(offering_id),
    cycle_id INT REFERENCES FeedbackCycle(cycle_id),
    reflection_notes TEXT NOT NULL,
    submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ActionReport (
    report_id SERIAL PRIMARY KEY,
    faculty_id VARCHAR(50) REFERENCES FacultyMember(faculty_id),
    offering_id INT REFERENCES CourseOffering(offering_id),
    cycle_id INT REFERENCES FeedbackCycle(cycle_id),
    improvement_plan TEXT NOT NULL,
    submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_read_only BOOLEAN DEFAULT TRUE
);

CREATE TABLE ReviewCheckIn (
    checkin_id SERIAL PRIMARY KEY,
    faculty_id VARCHAR(50) REFERENCES FacultyMember(faculty_id),
    hod_id VARCHAR(50) REFERENCES FacultyMember(faculty_id),
    offering_id INT REFERENCES CourseOffering(offering_id),
    meeting_date TIMESTAMP NOT NULL,
    discussion_notes TEXT,
    status VARCHAR(20) DEFAULT 'Scheduled'
);

CREATE TABLE ComplianceAudit (
    audit_id SERIAL PRIMARY KEY,
    response_id INT REFERENCES FeedbackResponse(response_id),
    violation_type VARCHAR(100) NOT NULL,
    justification_note TEXT,
    flagged_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ReviewOfReviews (
    ror_id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES FeedbackCycle(cycle_id),
    submitter_role VARCHAR(20) NOT NULL,
    feedback_text TEXT NOT NULL,
    submission_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
