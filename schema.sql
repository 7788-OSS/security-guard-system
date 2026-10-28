-- 安盾安保 · 保安管理系统 数据库结构（兼容 MySQL 5.6 / 5.7 / 8.0）
-- 用法：Navicat 新建连接后，右键连接 →「运行 SQL 文件」→ 选择本文件；或 mysql -u root -p < schema.sql
-- 说明：本机 MySQL 为 5.6，不支持 JSON 类型，因此 JSON 字段统一用 TEXT 存储（后端 JS 自行 JSON.stringify/parse）。
-- 表建好后启动 node server.js，后端 seed() 会自动写入演示数据。

CREATE DATABASE IF NOT EXISTS security_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE security_db;

CREATE TABLE IF NOT EXISTS projects (
  id          VARCHAR(10)  NOT NULL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  address     VARCHAR(200) NOT NULL,
  guards      INT          NOT NULL DEFAULT 0,
  freq        VARCHAR(10)  NOT NULL DEFAULT '2h',
  checkpoints TEXT         NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  code       VARCHAR(20) NOT NULL PRIMARY KEY,
  name       VARCHAR(50) NOT NULL,
  project_id VARCHAR(10),
  shift      VARCHAR(10),
  status     VARCHAR(10),
  phone      VARCHAR(30) DEFAULT '',
  patrol     INT         DEFAULT 0,
  KEY idx_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS punches (
  user_code  VARCHAR(20) NOT NULL,
  day        VARCHAR(10) NOT NULL,
  in_time    VARCHAR(5),
  out_time   VARCHAR(5),
  in_status  VARCHAR(10),
  out_status VARCHAR(10),
  PRIMARY KEY (user_code, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS patrol_records (
  user_code   VARCHAR(20)  NOT NULL,
  day         VARCHAR(10)  NOT NULL,
  due         VARCHAR(5)   NOT NULL,
  time        VARCHAR(5),
  checkpoints TEXT,
  note        VARCHAR(500),
  PRIMARY KEY (user_code, day, due)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS requests (
  id          VARCHAR(20)  NOT NULL PRIMARY KEY,
  kind        VARCHAR(20)  NOT NULL,
  applicant   VARCHAR(50),
  user_code   VARCHAR(20),
  payload     TEXT         NOT NULL,
  status      VARCHAR(20)  NOT NULL DEFAULT 'pending',
  created_at  VARCHAR(20),
  reviewed_at VARCHAR(20)  NULL,
  review      VARCHAR(500) NULL,
  KEY idx_kind_status (kind, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS salaries (
  user_code    VARCHAR(20) NOT NULL,
  month_key    VARCHAR(7)  NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  confirmed_at VARCHAR(20) NULL,
  PRIMARY KEY (user_code, month_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS salary_items (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_code  VARCHAR(20)   NOT NULL,
  month_key  VARCHAR(7)    NOT NULL,
  name       VARCHAR(50),
  note       VARCHAR(200),
  amount     DECIMAL(10,2),
  type       VARCHAR(10),
  KEY idx_user_month (user_code, month_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
