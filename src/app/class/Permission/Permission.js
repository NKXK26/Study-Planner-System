export default class Permission {
    constructor(data = {}) {
        this.ID = data.ID || null;
        this.Name = data.Name || '';
        this.Description = data.Description || '';
        this.Resource = data.Resource || '';
        this.Action = data.Action || '';
        this.Module = data.Module || '';
        this.IsActive = data.IsActive !== undefined ? data.IsActive : true;
        this.Scope = data.Scope || 'global'; // New: global, department, course-specific
        this.Conditions = data.Conditions || {}; // New: Conditional permissions
        this.CreatedAt = data.CreatedAt || new Date();
    }

    validate() {
        const errors = [];

        if (!this.Name || this.Name.trim() === '') {
            errors.push('Permission name is required');
        }

        if (!this.Resource || this.Resource.trim() === '') {
            errors.push('Resource is required');
        }

        if (!this.Action || this.Action.trim() === '') {
            errors.push('Action is required');
        }

        if (!this.Module || this.Module.trim() === '') {
            errors.push('Module is required');
        }

        if (this.Name && this.Name.length > 100) {
            errors.push('Permission name must be less than 100 characters');
        }

        if (this.Description && this.Description.length > 255) {
            errors.push('Description must be less than 255 characters');
        }

        return errors;
    }

    getFullPermission() {
        return `${this.Resource}:${this.Action}`;
    }

    toJSON() {
        return {
            ID: this.ID,
            Name: this.Name,
            Description: this.Description,
            Resource: this.Resource,
            Action: this.Action,
            Module: this.Module,
            IsActive: this.IsActive,
            Scope: this.Scope,
            Conditions: this.Conditions,
            CreatedAt: this.CreatedAt
        };
    }

    static fromJSON(json) {
        return new Permission(json);
    }

    // New method for conditional permissions
    evaluateConditions(context) {
        if (!this.Conditions || Object.keys(this.Conditions).length === 0) {
            return true;
        }

        // Example: Check if user belongs to specific department
        if (this.Conditions.department && context.userDepartment !== this.Conditions.department) {
            return false;
        }

        // Example: Check time-based conditions
        if (this.Conditions.timeWindow) {
            const now = new Date();
            const start = new Date(this.Conditions.timeWindow.start);
            const end = new Date(this.Conditions.timeWindow.end);

            if (now < start || now > end) {
                return false;
            }
        }

        // Example: Check resource ownership
        if (this.Conditions.requireOwnership && context.resourceOwnerID !== context.userID) {
            return false;
        }

        return true;
    }

    // Check if permission applies to a specific scope
    appliesToScope(scope) {
        if (this.Scope === 'global') return true;
        return this.Scope === scope;
    }

    // Check if permission is time-sensitive
    isTimeSensitive() {
        return this.Conditions && this.Conditions.timeWindow;
    }

    // Check if permission requires ownership
    requiresOwnership() {
        return this.Conditions && this.Conditions.requireOwnership;
    }

    // Clone permission with modifications
    clone(modifications = {}) {
        return new Permission({
            ...this.toJSON(),
            ...modifications,
            ID: null, // Reset ID for new permission
            CreatedAt: new Date()
        });
    }

    // Check if permission is equivalent to another
    equals(other) {
        if (!other || !(other instanceof Permission)) return false;

        return this.Resource === other.Resource &&
            this.Action === other.Action &&
            this.Module === other.Module;
    }

    // Get human-readable description
    getHumanReadable() {
        const actionMap = {
            'create': 'Create',
            'read': 'View',
            'update': 'Edit',
            'delete': 'Delete',
            'manage': 'Manage',
            'assign': 'Assign',
            'approve': 'Approve',
            'reject': 'Reject'
        };

        const resourceMap = {
            'course': 'Courses',
            'student': 'Students',
            'unit': 'Units',
            'term': 'Terms',
            'unit_type': 'Unit Types',
            'role': 'Roles',
            'user': 'Users',
            'system': 'System'
        };

        const action = actionMap[this.Action] || this.Action;
        const resource = resourceMap[this.Resource] || this.Resource;

        return `${action} ${resource}`;
    }
}
