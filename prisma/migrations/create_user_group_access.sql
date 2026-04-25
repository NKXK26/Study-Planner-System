-- Create UserGroupAccess table - Safe migration
-- This script creates the UserGroupAccess table and inserts default data

-- Create UserGroupAccess table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_group_access (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    access VARCHAR(255),
    module VARCHAR(255) NOT NULL
);

-- Insert default user group access records if they don't exist
INSERT INTO user_group_access (id, name, access, module) VALUES
(1, 'Default', 'basic', 'general'),
(2, 'Student', 'student', 'academic'),
(3, 'Staff', 'staff', 'academic'),
(4, 'Admin', 'admin', 'system')
ON CONFLICT (id) DO NOTHING;

-- Verify the table was created
SELECT 'UserGroupAccess table created successfully' as info;
SELECT * FROM user_group_access ORDER BY id;
