-- Migration: Add Role Hierarchy Support
-- Date: 2024-01-XX
-- Description: Adds parent role relationship and permission inheritance to roles table

-- Add new columns to roles table
ALTER TABLE roles ADD COLUMN IF NOT EXISTS parent_role_id INTEGER;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS inherit_permissions BOOLEAN DEFAULT true;

-- Add foreign key constraint for parent role
ALTER TABLE roles ADD CONSTRAINT fk_roles_parent_role 
  FOREIGN KEY (parent_role_id) REFERENCES roles(ID) ON DELETE SET NULL;

-- Add constraint to prevent self-referencing
ALTER TABLE roles ADD CONSTRAINT check_self_reference 
  CHECK (ID != parent_role_id);

-- Add index for better performance on parent role lookups
CREATE INDEX IF NOT EXISTS idx_roles_parent_role_id ON roles(parent_role_id);

-- Add columns to permissions table for conditional permissions
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS scope VARCHAR(50) DEFAULT 'global';
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '{}';

-- Add index for scope-based queries
CREATE INDEX IF NOT EXISTS idx_permissions_scope ON permissions(scope);

-- Update existing roles to have default values
UPDATE roles SET inherit_permissions = true WHERE inherit_permissions IS NULL;

-- Add comment to document the new structure
COMMENT ON COLUMN roles.parent_role_id IS 'Reference to parent role for inheritance hierarchy';
COMMENT ON COLUMN roles.inherit_permissions IS 'Whether this role inherits permissions from parent role';
COMMENT ON COLUMN permissions.scope IS 'Permission scope: global, department, course-specific, etc.';
COMMENT ON COLUMN permissions.conditions IS 'JSON object containing conditional logic for permission evaluation';

-- Verify the migration
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'roles' 
  AND column_name IN ('parent_role_id', 'inherit_permissions')
ORDER BY column_name;
