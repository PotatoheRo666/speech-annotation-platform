CREATE DATABASE IF NOT EXISTS voice_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'voice_admin'@'localhost' IDENTIFIED BY '123456';
GRANT ALL PRIVILEGES ON voice_db.* TO 'voice_admin'@'localhost';
FLUSH PRIVILEGES;
