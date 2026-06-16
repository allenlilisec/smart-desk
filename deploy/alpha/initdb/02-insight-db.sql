-- 为 insight 读模型创建独立库（core 使用 POSTGRES_DB=smartdesk_core）
CREATE DATABASE smartdesk_insight;
GRANT ALL PRIVILEGES ON DATABASE smartdesk_insight TO smartdesk;
