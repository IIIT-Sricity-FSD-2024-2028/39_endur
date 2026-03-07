CREATE DATABASE endur_db;
USE endur_db;

CREATE TABLE Department (
    department_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE Users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    department_id INT,
    FOREIGN KEY (department_id) REFERENCES Department(department_id)
);

CREATE TABLE Course (
    course_id INT AUTO_INCREMENT PRIMARY KEY,
    course_name VARCHAR(150) NOT NULL,
    department_id INT,
    FOREIGN KEY (department_id) REFERENCES Department(department_id)
);

CREATE TABLE CourseOffering (
    offering_id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT,
    faculty_id INT,
    semester VARCHAR(20),
    year INT,
    FOREIGN KEY (course_id) REFERENCES Course(course_id),
    FOREIGN KEY (faculty_id) REFERENCES Users(user_id)
);

CREATE TABLE FeedbackCycle (
    cycle_id INT AUTO_INCREMENT PRIMARY KEY,
    start_timestamp DATETIME,
    end_timestamp DATETIME,
    status VARCHAR(20)
);

CREATE TABLE EvaluationParameter (
    parameter_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    description TEXT
);

CREATE TABLE FeedbackResponse (
    response_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT,
    offering_id INT,
    cycle_id INT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES Users(user_id),
    FOREIGN KEY (offering_id) REFERENCES CourseOffering(offering_id),
    FOREIGN KEY (cycle_id) REFERENCES FeedbackCycle(cycle_id)
);

CREATE TABLE PerformanceScore (
    score_id INT AUTO_INCREMENT PRIMARY KEY,
    response_id INT,
    parameter_id INT,
    score INT,
    comment TEXT,
    FOREIGN KEY (response_id) REFERENCES FeedbackResponse(response_id),
    FOREIGN KEY (parameter_id) REFERENCES EvaluationParameter(parameter_id)
);

CREATE TABLE SelfReflection (
    reflection_id INT AUTO_INCREMENT PRIMARY KEY,
    faculty_id INT,
    offering_id INT,
    cycle_id INT,
    reflection_text TEXT,
    expected_score DECIMAL(5,2),
    FOREIGN KEY (faculty_id) REFERENCES Users(user_id),
    FOREIGN KEY (offering_id) REFERENCES CourseOffering(offering_id),
    FOREIGN KEY (cycle_id) REFERENCES FeedbackCycle(cycle_id)
);

CREATE TABLE GapAnalysis (
    gap_id INT AUTO_INCREMENT PRIMARY KEY,
    reflection_id INT,
    avg_student_score DECIMAL(5,2),
    gap_value DECIMAL(5,2),
    FOREIGN KEY (reflection_id) REFERENCES SelfReflection(reflection_id)
);

CREATE TABLE ActionReport (
    report_id INT AUTO_INCREMENT PRIMARY KEY,
    faculty_id INT,
    offering_id INT,
    cycle_id INT,
    report_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (faculty_id) REFERENCES Users(user_id),
    FOREIGN KEY (offering_id) REFERENCES CourseOffering(offering_id),
    FOREIGN KEY (cycle_id) REFERENCES FeedbackCycle(cycle_id)
);

CREATE TABLE ReviewCheckIn (
    checkin_id INT AUTO_INCREMENT PRIMARY KEY,
    report_id INT,
    hod_id INT,
    meeting_date DATE,
    notes TEXT,
    FOREIGN KEY (report_id) REFERENCES ActionReport(report_id),
    FOREIGN KEY (hod_id) REFERENCES Users(user_id)
);

CREATE TABLE AnonymizedReport (
    report_id INT AUTO_INCREMENT PRIMARY KEY,
    offering_id INT,
    cycle_id INT,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    avg_score DECIMAL(5,2),
    FOREIGN KEY (offering_id) REFERENCES CourseOffering(offering_id),
    FOREIGN KEY (cycle_id) REFERENCES FeedbackCycle(cycle_id)
);

CREATE TABLE ComplianceAudit (
    audit_id INT AUTO_INCREMENT PRIMARY KEY,
    response_id INT,
    flag_type VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (response_id) REFERENCES FeedbackResponse(response_id)
);
