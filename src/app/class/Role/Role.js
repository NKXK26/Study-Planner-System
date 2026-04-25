export default class Role {
    constructor(data = {}) {
        this.ID = data.ID || null;
        this.Name = data.Name || '';
        this.Description = data.Description || '';
        this.Color = data.Color || '#3B82F6'; // Default blue color
        this.Priority = data.Priority || 0;
        this.IsSystem = data.IsSystem || false;
        this.IsActive = data.IsActive !== undefined ? data.IsActive : true;
            // this.ParentRoleID = data.ParentRoleID || null; // Temporarily disabled: Role hierarchy support
    // this.InheritPermissions = data.InheritPermissions !== undefined ? data.InheritPermissions : true; // Temporarily disabled: Permission inheritance
        this.CreatedAt = data.CreatedAt || new Date();
        this.UpdatedAt = data.UpdatedAt || new Date();
    }

    validate() {
        const errors = [];
        
        if (!this.Name || this.Name.trim() === '') {
            errors.push('Role name is required');
        }
        
        if (this.Name && this.Name.length > 50) {
            errors.push('Role name must be less than 50 characters');
        }
        
        if (this.Description && this.Description.length > 255) {
            errors.push('Description must be less than 255 characters');
        }
        
        if (this.Priority < 0 || this.Priority > 100) {
            errors.push('Priority must be between 0 and 100');
        }
        
        return errors;
    }

    toJSON() {
        return {
            ID: this.ID,
            Name: this.Name,
            Description: this.Description,
            Color: this.Color,
            Priority: this.Priority,
            IsSystem: this.IsSystem,
            IsActive: this.IsActive,
                    // ParentRoleID: this.ParentRoleID, // Temporarily disabled
        // InheritPermissions: this.InheritPermissions, // Temporarily disabled
            CreatedAt: this.CreatedAt,
            UpdatedAt: this.UpdatedAt
        };
    }

    static fromJSON(json) {
        return new Role(json);
    }

    // Check if role is a system role
    isSystemRole() {
        return this.IsSystem === true;
    }

    // Check if role can be modified
    canBeModified() {
        return !this.isSystemRole();
    }

    // Check if role can be deleted
    canBeDeleted() {
        return !this.isSystemRole() && this.IsActive;
    }

    // Get role priority level
    getPriorityLevel() {
        if (this.Priority >= 80) return 'high';
        if (this.Priority >= 50) return 'medium';
        return 'low';
    }

    // Check if role has higher priority than another
    hasHigherPriorityThan(otherRole) {
        return this.Priority > otherRole.Priority;
    }

    // Clone role with modifications
    clone(modifications = {}) {
        return new Role({
            ...this.toJSON(),
            ...modifications,
            ID: null, // Reset ID for new role
            CreatedAt: new Date(),
            UpdatedAt: new Date()
        });
    }

    // Check if role is equivalent to another
    equals(other) {
        if (!other || !(other instanceof Role)) return false;
        
        return this.Name === other.Name && 
               this.Description === other.Description &&
               this.Priority === other.Priority;
    }

    // Get human-readable priority
    getPriorityLabel() {
        const priorityMap = {
            'high': 'High Priority',
            'medium': 'Medium Priority',
            'low': 'Low Priority'
        };
        return priorityMap[this.getPriorityLevel()] || 'Unknown Priority';
    }

    // Check if role is active and usable
    isUsable() {
        return this.IsActive && this.IsSystem !== undefined;
    }

    // Get role display name with priority indicator
    getDisplayName() {
        if (this.Priority >= 80) {
            return `${this.Name} ⭐`;
        }
        return this.Name;
    }
}
