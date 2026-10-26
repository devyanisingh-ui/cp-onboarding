-- Runs once, when the MySQL volume is first created.
-- cp_onboarding_test is wiped by the server tests; `prisma migrate dev` also needs to create a
-- temporary shadow database, hence the wider grant (local only).
CREATE DATABASE IF NOT EXISTS cp_onboarding_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON *.* TO 'cp'@'%';
FLUSH PRIVILEGES;
