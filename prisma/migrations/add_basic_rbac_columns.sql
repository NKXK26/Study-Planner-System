-- Basic RBAC Migration - Safe to run on existing database
-- This script only adds missing columns without affecting existing data

-- Add missing columns to roles table if they don't exist
DO $$ 
BEGIN
    -- Add Priority column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'roles' AND column_name = 'priority') THEN
        ALTER TABLE roles ADD COLUMN priority INTEGER DEFAULT 0;
    END IF;
    
    -- Add Color column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'roles' AND column_name = 'color') THEN
        ALTER TABLE roles ADD COLUMN color VARCHAR DEFAULT '#dc2d27';
    END IF;
    
    -- Add IsSystem column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'roles' AND column_name = 'issystem') THEN
        ALTER TABLE roles ADD COLUMN issystem BOOLEAN DEFAULT false;
    END IF;
    
    -- Add IsActive column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'roles' AND column_name = 'isactive') THEN
        ALTER TABLE roles ADD COLUMN isactive BOOLEAN DEFAULT true;
    END IF;
    
    -- Add CreatedAt column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'roles' AND column_name = 'createdat') THEN
        ALTER TABLE roles ADD COLUMN createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    -- Add UpdatedAt column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'roles' AND column_name = 'updatedat') THEN
        ALTER TABLE roles ADD COLUMN updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Add missing columns to permissions table if they don't exist
DO $$ 
BEGIN
    -- Add IsActive column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'permissions' AND column_name = 'isactive') THEN
        ALTER TABLE permissions ADD COLUMN isactive BOOLEAN DEFAULT true;
    END IF;
    
    -- Add CreatedAt column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'permissions' AND column_name = 'createdat') THEN
        ALTER TABLE permissions ADD COLUMN createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Add missing columns to user_roles table if they don't exist
DO $$ 
BEGIN
    -- Add AssignedBy column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_roles' AND column_name = 'assignedby') THEN
        ALTER TABLE user_roles ADD COLUMN assignedby INTEGER;
    END IF;
    
    -- Add ExpiresAt column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_roles' AND column_name = 'expiresat') THEN
        ALTER TABLE user_roles ADD COLUMN expiresat TIMESTAMP;
    END IF;
END $$;

-- Add missing columns to role_permissions table if they don't exist
DO $$ 
BEGIN
    -- Add GrantedAt column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'role_permissions' AND column_name = 'grantedat') THEN
        ALTER TABLE role_permissions ADD COLUMN grantedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    -- Add GrantedBy column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'role_permissions' AND column_name = 'grantedby') THEN
        ALTER TABLE role_permissions ADD COLUMN grantedby INTEGER;
    END IF;
END $$;

-- Verify the changes
SELECT 'Roles table columns:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'roles' 
ORDER BY column_name;

SELECT 'Permissions table columns:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'permissions' 
ORDER BY column_name;
