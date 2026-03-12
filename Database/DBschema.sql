DROP DATABASE IF EXISTS endur_db;
CREATE DATABASE endur_db;
USE endur_db;

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
    hod_id INT AUTO_INCREMENT PRIMARY KEY,
    faculty_id VARCHAR(50),
    department_managed VARCHAR(100),
    FOREIGN KEY (faculty_id) REFERENCES FacultyMember(faculty_id)
);

CREATE TABLE Dean (
    dean_id INT AUTO_INCREMENT PRIMARY KEY,
    faculty_id VARCHAR(50),
    FOREIGN KEY (faculty_id) REFERENCES FacultyMember(faculty_id)
);

CREATE TABLE CourseOffering (
    offering_id INT AUTO_INCREMENT PRIMARY KEY,
    course_name VARCHAR(100),
    course_code VARCHAR(20),
    semester VARCHAR(20),
    faculty_id VARCHAR(50),
    FOREIGN KEY (faculty_id) REFERENCES FacultyMember(faculty_id)
);

CREATE TABLE FeedbackCycle (
    cycle_id INT AUTO_INCREMENT PRIMARY KEY,
    cycle_name VARCHAR(100),
    start_datetime TIMESTAMP,
    end_datetime TIMESTAMP,
    status VARCHAR(50)
);

CREATE TABLE EvaluationParameter (
    parameter_id INT AUTO_INCREMENT PRIMARY KEY,
    parameter_name VARCHAR(100),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE FeedbackResponse (
    response_id INT AUTO_INCREMENT PRIMARY KEY,
    cycle_id INT,
    offering_id INT,
    student_id VARCHAR(50),
    submission_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    attendance_weight DECIMAL(3,2),
    FOREIGN KEY (cycle_id) REFERENCES FeedbackCycle(cycle_id),
    FOREIGN KEY (offering_id) REFERENCES CourseOffering(offering_id),
    FOREIGN KEY (student_id) REFERENCES Student(student_id)
);

CREATE TABLE PerformanceScore (
    score_id INT AUTO_INCREMENT PRIMARY KEY,
    response_id INT,
    parameter_id INT,
    numeric_rating INT CHECK (numeric_rating BETWEEN 1 AND 10),
    applied_weight DECIMAL(3,2),
    FOREIGN KEY (response_id) REFERENCES FeedbackResponse(response_id),
    FOREIGN KEY (parameter_id) REFERENCES EvaluationParameter(parameter_id)
);

CREATE TABLE QualitativeFeedback (
    qualitative_id INT AUTO_INCREMENT PRIMARY KEY,
    response_id INT,
    free_text_comment TEXT,
    FOREIGN KEY (response_id) REFERENCES FeedbackResponse(response_id)
);

CREATE TABLE ComplianceAudit (
    audit_id INT AUTO_INCREMENT PRIMARY KEY,
    response_id INT,
    flag_reason VARCHAR(200),
    flag_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_valid_submission BOOLEAN,
    FOREIGN KEY (response_id) REFERENCES FeedbackResponse(response_id)
);

CREATE TABLE SelfReflection (
    reflection_id INT AUTO_INCREMENT PRIMARY KEY,
    faculty_id VARCHAR(50),
    offering_id INT,
    cycle_id INT,
    notes TEXT,
    submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (faculty_id) REFERENCES FacultyMember(faculty_id),
    FOREIGN KEY (offering_id) REFERENCES CourseOffering(offering_id),
    FOREIGN KEY (cycle_id) REFERENCES FeedbackCycle(cycle_id)
);

CREATE TABLE ActionReport (
    action_id INT AUTO_INCREMENT PRIMARY KEY,
    faculty_id VARCHAR(50),
    offering_id INT,
    planned_strategies TEXT,
    submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (faculty_id) REFERENCES FacultyMember(faculty_id),
    FOREIGN KEY (offering_id) REFERENCES CourseOffering(offering_id)
);

CREATE TABLE GapAnalysis (
    gap_id INT AUTO_INCREMENT PRIMARY KEY,
    reflection_id INT,
    action_id INT,
    perception_difference_notes TEXT,
    identified_blind_spots TEXT,
    FOREIGN KEY (reflection_id) REFERENCES SelfReflection(reflection_id),
    FOREIGN KEY (action_id) REFERENCES ActionReport(action_id)
);

CREATE TABLE ReviewOfReviews (
    ror_id INT AUTO_INCREMENT PRIMARY KEY,
    submitted_by_user_id VARCHAR(50),
    cycle_id INT,
    process_feedback TEXT,
    submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cycle_id) REFERENCES FeedbackCycle(cycle_id)
);

CREATE TABLE AnonymizedReport (
    report_id INT AUTO_INCREMENT PRIMARY KEY,
    cycle_id INT,
    offering_id INT,
    aggregated_scores TEXT,
    grouped_comments TEXT,
    generation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (cycle_id, offering_id),
    FOREIGN KEY (cycle_id) REFERENCES FeedbackCycle(cycle_id),
    FOREIGN KEY (offering_id) REFERENCES CourseOffering(offering_id)
);

CREATE TABLE ReviewCheckIn (
    checkin_id INT AUTO_INCREMENT PRIMARY KEY,
    faculty_id VARCHAR(50),
    hod_id INT,
    meeting_date DATE,
    discussion_notes TEXT,
    action_id INT,
    FOREIGN KEY (faculty_id) REFERENCES FacultyMember(faculty_id),
    FOREIGN KEY (hod_id) REFERENCES DepartmentHead(hod_id),
    FOREIGN KEY (action_id) REFERENCES ActionReport(action_id)
);
