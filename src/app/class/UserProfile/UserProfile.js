export default class UserProfile {
    constructor(data = {}) {
        this.ID = data.ID || null;
        this.UserID = data.UserID || null;
        this.UserEmail = data.UserEmail || '';
        this.UserGroupAccessID = data.UserGroupAccessID || null;
        this.IsActive = data.IsActive !== undefined ? data.IsActive : true;
        this.CreatedAt = data.CreatedAt || new Date();
        this.UpdatedAt = data.UpdatedAt || new Date();
        
        // Related data
        this.UserRoles = data.UserRoles || [];
        this.RoleAssignments = data.RoleAssignments || [];
        this.PermissionGrants = data.PermissionGrants || [];
    }

    validate() {
        const errors = [];
        
        if (!this.UserID) {
            errors.push('UserID is required');
        }
        
        if (!this.UserEmail) {
            errors.push('UserEmail is required');
        }
        
        if (!this.UserGroupAccessID) {
            errors.push('UserGroupAccessID is required');
        }
        
        if (this.CreatedAt && !(this.CreatedAt instanceof Date)) {
            errors.push('CreatedAt must be a valid date');
        }
        
        if (this.UpdatedAt && !(this.UpdatedAt instanceof Date)) {
            errors.push('UpdatedAt must be a valid date');
        }
        
        return errors;
    }

    // Helper method to get all roles for this user profile
    getRoles() {
        return this.UserRoles.map(userRole => userRole.Role);
    }

    // Helper method to check if user has a specific role
    hasRole(roleName) {
        return this.UserRoles.some(userRole => 
            userRole.Role && userRole.Role.Name === roleName
        );
    }

    // Helper method to check if user has any of the specified roles
    hasAnyRole(roleNames) {
        return this.UserRoles.some(userRole => 
            userRole.Role && roleNames.includes(userRole.Role.Name)
        );
    }

    toJSON() {
        return {
            ID: this.ID,
            UserID: this.UserID,
            UserEmail: this.UserEmail,
            UserGroupAccessID: this.UserGroupAccessID,
            IsActive: this.IsActive,
            CreatedAt: this.CreatedAt,
            UpdatedAt: this.UpdatedAt,
            UserRoles: this.UserRoles,
            RoleAssignments: this.RoleAssignments,
            PermissionGrants: this.PermissionGrants
        };
    }

    static fromJSON(json) {
        return new UserProfile(json);
    }
}
