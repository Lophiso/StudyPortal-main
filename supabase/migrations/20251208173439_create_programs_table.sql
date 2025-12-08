/*
  # Create Programs Table for StudyPortal

  ## Description
  This migration creates the core programs table for the educational directory platform,
  along with initial seed data of 15 realistic educational programs.

  ## New Tables
  - `programs`
    - `id` (int8, primary key) - Unique identifier for each program
    - `title` (text) - Program name (e.g., "MSc in Data Science")
    - `university` (text) - University offering the program
    - `country` (text) - Country where program is offered
    - `tuition_fee` (numeric) - Annual tuition cost
    - `currency` (text) - Currency code (EUR, USD, GBP)
    - `duration_months` (int) - Program duration in months
    - `study_level` (text) - Academic level (Bachelor, Master, PhD)
    - `description` (text) - Detailed program description
    - `created_at` (timestamptz) - Record creation timestamp

  ## Security
  - Enable Row Level Security (RLS) on programs table
  - Add policy for public read access (educational directory is publicly viewable)

  ## Seed Data
  Includes 15 realistic programs across:
  - Countries: USA, UK, Germany
  - Levels: Bachelor, Master
  - Disciplines: Data Science, Business, Engineering, Law, Medicine
*/

-- Create programs table
CREATE TABLE IF NOT EXISTS programs (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  university text NOT NULL,
  country text NOT NULL,
  tuition_fee numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  duration_months int NOT NULL,
  study_level text NOT NULL,
  description text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access (anyone can view programs)
CREATE POLICY "Programs are publicly readable"
  ON programs
  FOR SELECT
  TO anon
  USING (true);

-- Seed data with 15 realistic educational programs
INSERT INTO programs (title, university, country, tuition_fee, currency, duration_months, study_level, description) VALUES
-- Master Programs
('MSc in Data Science', 'University of Oxford', 'United Kingdom', 32000, 'GBP', 12, 'Master', 'A comprehensive program covering machine learning, statistical analysis, big data technologies, and data visualization. Students will work on real-world projects with industry partners and gain hands-on experience with cutting-edge data science tools.'),

('Master of Business Administration (MBA)', 'Harvard Business School', 'United States', 73440, 'USD', 24, 'Master', 'World-renowned MBA program focusing on leadership, strategy, and innovation. Features case-study methodology, global immersion experiences, and access to an extensive alumni network across all industries.'),

('MSc in Artificial Intelligence', 'Technical University of Munich', 'Germany', 3000, 'EUR', 24, 'Master', 'Advanced study of AI technologies including deep learning, natural language processing, computer vision, and robotics. Program emphasizes both theoretical foundations and practical applications in industry settings.'),

('Master of Laws (LLM) in International Law', 'London School of Economics', 'United Kingdom', 28000, 'GBP', 12, 'Master', 'Specialized program in international law covering human rights, trade law, and international dispute resolution. Students benefit from LSE''s location in London and proximity to international legal institutions.'),

('MSc in Mechanical Engineering', 'MIT', 'United States', 55450, 'USD', 24, 'Master', 'Leading engineering program covering robotics, thermodynamics, materials science, and advanced manufacturing. Students have access to state-of-the-art labs and research facilities at one of the world''s top engineering schools.'),

('Master in Management', 'ESMT Berlin', 'Germany', 36000, 'EUR', 24, 'Master', 'International management program with focus on innovation, digital transformation, and sustainable business practices. Includes consulting projects with German and international companies.'),

('MSc in Cybersecurity', 'Imperial College London', 'United Kingdom', 35900, 'GBP', 12, 'Master', 'Comprehensive cybersecurity program covering network security, cryptography, ethical hacking, and security policy. Graduates are highly sought after by government agencies and tech companies.'),

-- Bachelor Programs
('BSc in Computer Science', 'Stanford University', 'United States', 57693, 'USD', 48, 'Bachelor', 'Top-ranked computer science program in Silicon Valley. Curriculum covers algorithms, systems, AI, and software engineering. Students have unparalleled internship opportunities with nearby tech giants and startups.'),

('Bachelor of Business Administration', 'University of Mannheim', 'Germany', 1500, 'EUR', 36, 'Bachelor', 'Leading business program in Germany with strong focus on analytics and digital business. Taught primarily in English with opportunities for international exchanges and internships.'),

('BSc in Biomedical Engineering', 'Johns Hopkins University', 'United States', 58720, 'USD', 48, 'Bachelor', 'Interdisciplinary program combining engineering, biology, and medicine. Students work alongside medical researchers and have access to Johns Hopkins Hospital for practical experience.'),

('BA in Economics', 'University of Cambridge', 'United Kingdom', 25734, 'GBP', 36, 'Bachelor', 'Rigorous economics program at one of the world''s oldest universities. Combines economic theory with mathematics and statistics, preparing students for careers in finance, consulting, and policy.'),

('BSc in Environmental Science', 'University of California, Berkeley', 'United States', 43980, 'USD', 48, 'Bachelor', 'Interdisciplinary program addressing climate change, sustainability, and environmental policy. Students engage in field work and research projects in California''s diverse ecosystems.'),

('Bachelor of Engineering in Electrical Engineering', 'RWTH Aachen University', 'Germany', 500, 'EUR', 42, 'Bachelor', 'Prestigious engineering program with strong industry connections. Covers power systems, electronics, communications, and automation technology. Many courses available in English.'),

('BSc in Psychology', 'University College London', 'United Kingdom', 28500, 'GBP', 36, 'Bachelor', 'Comprehensive psychology program covering cognitive, developmental, and social psychology. Students gain practical research experience and clinical exposure through partnerships with NHS facilities.'),

('BA in International Relations', 'Georgetown University', 'United States', 59950, 'USD', 48, 'Bachelor', 'Premier international relations program in Washington DC. Students benefit from proximity to government agencies, embassies, and international organizations, with extensive internship opportunities.');
