-- Emailit Database Schema
-- Run this once on your Hostinger MySQL database

CREATE DATABASE IF NOT EXISTS emailit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE emailit;

-- Email accounts (SMTP + IMAP connections)
CREATE TABLE email_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  smtp_host VARCHAR(255) NOT NULL,
  smtp_port SMALLINT NOT NULL DEFAULT 587,
  smtp_user VARCHAR(255) NOT NULL,
  smtp_pass TEXT NOT NULL,             -- encrypted
  imap_host VARCHAR(255),
  imap_port SMALLINT DEFAULT 993,
  daily_limit INT DEFAULT 100,
  sent_today INT DEFAULT 0,
  last_reset_date DATE,
  status ENUM('connected','error','pending') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sending domains
CREATE TABLE domains (
  id INT AUTO_INCREMENT PRIMARY KEY,
  domain VARCHAR(255) NOT NULL UNIQUE,
  spf_status ENUM('pass','fail','pending') DEFAULT 'pending',
  dkim_status ENUM('pass','fail','pending') DEFAULT 'pending',
  dmarc_status ENUM('pass','fail','pending') DEFAULT 'pending',
  dkim_selector VARCHAR(50) DEFAULT 'emailit',
  dkim_private_key TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contacts
CREATE TABLE contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  company VARCHAR(255),
  status ENUM('subscribed','unsubscribed','bounced') DEFAULT 'subscribed',
  tags JSON,
  custom_fields JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Email templates
CREATE TABLE templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  category VARCHAR(100),
  use_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Campaigns
CREATE TABLE campaigns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  from_account_id INT,
  status ENUM('draft','scheduled','sending','sent','paused') DEFAULT 'draft',
  scheduled_at TIMESTAMP NULL,
  sent_at TIMESTAMP NULL,
  recipient_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  opened_count INT DEFAULT 0,
  clicked_count INT DEFAULT 0,
  bounced_count INT DEFAULT 0,
  unsubscribed_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_account_id) REFERENCES email_accounts(id) ON DELETE SET NULL
);

-- Automation workflows
CREATE TABLE workflows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  status ENUM('active','paused','draft') DEFAULT 'draft',
  trigger_type VARCHAR(100),         -- 'contact_added','tag_added','manual'
  trigger_config JSON,
  steps JSON NOT NULL,               -- array of {type, config, delay_hours}
  enrolled_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Contacts enrolled in workflows
CREATE TABLE workflow_enrollments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workflow_id INT NOT NULL,
  contact_id INT NOT NULL,
  current_step INT DEFAULT 0,
  status ENUM('active','completed','cancelled','failed') DEFAULT 'active',
  next_send_at TIMESTAMP NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  UNIQUE KEY unique_enrollment (workflow_id, contact_id),
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  INDEX idx_next_send (next_send_at, status)
);

-- Email send queue (processed by cron every minute)
CREATE TABLE send_queue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account_id INT NOT NULL,
  to_email VARCHAR(255) NOT NULL,
  to_name VARCHAR(255),
  subject VARCHAR(500) NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  campaign_id INT NULL,
  workflow_id INT NULL,
  enrollment_id INT NULL,
  step_index INT NULL,
  status ENUM('pending','sending','sent','failed') DEFAULT 'pending',
  scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP NULL,
  error_message TEXT NULL,
  message_id VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES email_accounts(id),
  INDEX idx_scheduled (scheduled_at, status)
);

-- Email tracking events
CREATE TABLE email_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  queue_id INT,
  event_type ENUM('delivered','opened','clicked','bounced','unsubscribed') NOT NULL,
  contact_email VARCHAR(255),
  url_clicked VARCHAR(2048) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (queue_id) REFERENCES send_queue(id) ON DELETE SET NULL,
  INDEX idx_event_type (event_type),
  INDEX idx_contact (contact_email)
);

-- Inbox threads (synced from IMAP)
CREATE TABLE inbox_threads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account_id INT NOT NULL,
  message_id VARCHAR(500) NOT NULL,
  thread_id VARCHAR(500),
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  subject VARCHAR(500),
  body_html TEXT,
  body_text TEXT,
  is_read TINYINT(1) DEFAULT 0,
  is_starred TINYINT(1) DEFAULT 0,
  imap_uid INT,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_message (account_id, message_id),
  FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE,
  INDEX idx_account_received (account_id, received_at)
);
