export default class UserRole {
    constructor(data = {}) {
        this.ID = data.ID || null;
        this.UserProfileID = data.UserProfileID || null;
        this.RoleID = data.RoleID || null;
        this.AssignedBy = data.AssignedBy || null;
        this.AssignedAt = data.AssignedAt || new Date();
        this.ExpiresAt = data.ExpiresAt || null;
    }

    validate() {
        const errors = [];
        
        if (!this.UserProfileID) {
            errors.push('UserProfileID is required');
        }
        
        if (!this.RoleID) {
            errors.push('RoleID is required');
        }
        
        if (this.AssignedAt && !(this.AssignedAt instanceof Date)) {
            errors.push('AssignedAt must be a valid date');
        }
        
        if (this.ExpiresAt && !(this.ExpiresAt instanceof Date)) {
            errors.push('ExpiresAt must be a valid date');
        }
        
        return errors;
    }

    isExpired() {
        if (!this.ExpiresAt) return false;
        return new Date() > this.ExpiresAt;
    }

    getDaysUntilExpiration() {
        if (!this.ExpiresAt) return null;
        const now = new Date();
        const diffTime = this.ExpiresAt - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }

    toJSON() {
        return {
            ID: this.ID,
            UserProfileID: this.UserProfileID,
            RoleID: this.RoleID,
            AssignedBy: this.AssignedBy,
            AssignedAt: this.AssignedAt,
            ExpiresAt: this.ExpiresAt
        };
    }

    static fromJSON(json) {
        return new UserRole(json);
    }
}
