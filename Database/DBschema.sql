DROP DATABASE IF EXISTS endur_db;
CREATE DATABASE endur_db;
\c endur_db;

CREATE TABLE Student (
    student_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    batch_year INT NOT NULL,
    program VARCHAR(100)
);

CREATE TABLE FacultyMember (
    faculty_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    department VARCHAR(100),
    designation VARCHAR(100)
);

CREATE TABLE DepartmentHead (
    hod_id SERIAL PRIMARY KEY,
    faculty_id VARCHAR(50) REFERENCES FacultyMember(faculty_id),
    department_managed VARCHAR(100)
);

CREATE TABLE Dean (
    dean_id SERIAL PRIMARY KEY,
    faculty_id VARCHAR(50) REFERENCES FacultyMember(faculty_id),
    office_title VARCHAR(100)
);

CREATE TABLE CourseOffering (
    offering_id SERIAL PRIMARY KEY,
    course_name VARCHAR(100),
    course_code VARCHAR(20),
    semester VARCHAR(20),
    student_cohort VARCHAR(50),
    faculty_id VARCHAR(50) REFERENCES FacultyMember(faculty_id)
);

CREATE TABLE FeedbackCycle (
    cycle_id SERIAL PRIMARY KEY,
    cycle_name VARCHAR(100),
    start_datetime TIMESTAMP,
    end_datetime TIMESTAMP,
    status VARCHAR(50)
);

CREATE TABLE EvaluationParameter (
    parameter_id SERIAL PRIMARY KEY,
    parameter_name VARCHAR(100),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE FeedbackResponse (
    response_id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES FeedbackCycle(cycle_id),
    offering_id INT REFERENCES CourseOffering(offering_id),
    submission_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    attendance_weight DECIMAL(3,2)
);

CREATE TABLE PerformanceScore (
    score_id SERIAL PRIMARY KEY,
    response_id INT REFERENCES FeedbackResponse(response_id),
    parameter_id INT REFERENCES EvaluationParameter(parameter_id),
    numeric_rating INT CHECK (numeric_rating BETWEEN 1 AND 10),
    applied_weight DECIMAL(3,2)
);

CREATE TABLE QualitativeFeedback (
    qualitative_id SERIAL PRIMARY KEY,
    response_id INT REFERENCES FeedbackResponse(response_id),
    free_text_comment TEXT
);

CREATE TABLE ComplianceAudit (
    audit_id SERIAL PRIMARY KEY,
    response_id INT REFERENCES FeedbackResponse(response_id),
    flag_reason VARCHAR(200),
    flag_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_valid_submission BOOLEAN
);

CREATE TABLE SelfReflection (
    reflection_id SERIAL PRIMARY KEY,
    faculty_id VARCHAR(50) REFERENCES FacultyMember(faculty_id),
    offering_id INT REFERENCES CourseOffering(offering_id),
    cycle_id INT REFERENCES FeedbackCycle(cycle_id),
    notes TEXT,
    submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ActionReport (
    action_id SERIAL PRIMARY KEY,
    faculty_id VARCHAR(50) REFERENCES FacultyMember(faculty_id),
    offering_id INT REFERENCES CourseOffering(offering_id),
    planned_strategies TEXT,
    submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE GapAnalysis (
    gap_id SERIAL PRIMARY KEY,
    reflection_id INT REFERENCES SelfReflection(reflection_id),
    action_id INT REFERENCES ActionReport(action_id),
    perception_difference_notes TEXT,
    identified_blind_spots TEXT
);

CREATE TABLE ReviewOfReviews (
    ror_id SERIAL PRIMARY KEY,
    submitted_by_user_id VARCHAR(50),
    feedback_on_process TEXT,
    submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE AnonymizedReport (
    report_id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES FeedbackCycle(cycle_id),
    offering_id INT REFERENCES CourseOffering(offering_id),
    aggregated_scores TEXT,
    grouped_comments TEXT,
    generation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ReviewCheckIn (
    checkin_id SERIAL PRIMARY KEY,
    faculty_id VARCHAR(50) REFERENCES FacultyMember(faculty_id),
    hod_id INT REFERENCES DepartmentHead(hod_id),
    meeting_date DATE,
    discussion_notes TEXT,
    action_id INT REFERENCES ActionReport(action_id)
);
