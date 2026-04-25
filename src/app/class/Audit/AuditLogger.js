import prisma from '@utils/db/db';

/**
 * AuditLogger class for comprehensive audit trail
 * Tracks all role and permission changes for compliance
 */
export default class AuditLogger {
  /**
   * Compute a minimal diff between two plain objects.
   * Returns an object with keys that changed and their { before, after } values.
   */
  static diffObjects(oldObject = {}, newObject = {}) {
    try {
      const before = oldObject || {};
      const after = newObject || {};

      const allKeys = new Set([
        ...Object.keys(before || {}),
        ...Object.keys(after || {})
      ]);

      const diff = {};
      allKeys.forEach((key) => {
        const beforeVal = before?.[key];
        const afterVal = after?.[key];
        const changed = JSON.stringify(beforeVal) !== JSON.stringify(afterVal);
        if (changed) {
          diff[key] = { before: beforeVal, after: afterVal };
        }
      });
      return diff;
    } catch (err) {
      // Fallback: if diffing fails for any reason, capture raw objects
      return { __raw__: { before: oldObject, after: newObject } };
    }
  }

  /**
   * Generic CRUD audit logger.
   *
   * @param {Object} params
   * @param {number|undefined} params.userId - Numeric internal user id if available
   * @param {string|undefined} params.email - Actor email if available
   * @param {string} params.module - System module, e.g. 'course_management'
   * @param {string} params.action - One of CREATE, READ, UPDATE, DELETE or domain actions
   * @param {string} params.entity - Entity/table name, e.g. 'Course'
   * @param {string|number|undefined} params.entityId - Primary key value
   * @param {Object|undefined} params.before - Previous record snapshot
   * @param {Object|undefined} params.after - New record snapshot
   * @param {string|undefined} params.reason - Optional reason string
   * @param {Object|undefined} params.metadata - Any extra metadata to include
   * @param {Object|undefined} params.req - Optional request object for IP extraction
   */
  static async logCRUD({
    userId,
    email,
    module,
    action,
    entity,
    entityId,
    before,
    after,
    reason,
    metadata,
    req
  }) {
    try {
      const diff =
        action?.toUpperCase() === 'UPDATE'
          ? this.diffObjects(before, after)
          : undefined;

      const details = {
        entity,
        entityId,
        reason,
        email,
        diff,
        before: action?.toUpperCase() === 'CREATE' ? undefined : before,
        after,
        metadata,
        timestamp: new Date(),
        action
      };

      await prisma.AuditLog.create({
        data: {
          UserID: typeof userId === 'number' ? userId : null,
          Action: `${entity?.toUpperCase() || 'ENTITY'}_${action?.toUpperCase()}`,
          Module: module,
          Details: JSON.stringify(details),
          IPAddress: this.getClientIP(req),
          UserAgent: this.getUserAgent()
        }
      });
    } catch (error) {
      console.error('Error logging CRUD action:', error);
    }
  }

  /** Convenience helpers for common CRUD verbs */
  static async logCreate(params) {
    return this.logCRUD({ ...params, action: 'CREATE' });
  }

  static async logRead(params) {
    return this.logCRUD({ ...params, action: 'READ' });
  }

  static async logUpdate(params) {
    return this.logCRUD({ ...params, action: 'UPDATE' });
  }

  static async logDelete(params) {
    return this.logCRUD({ ...params, action: 'DELETE' });
  }
  /**
   * Log role assignment to a user
   * @param {number} userId - User ID
   * @param {Array} roleIds - Array of role IDs
   * @param {string} assignedBy - User who assigned the role
   * @param {string} reason - Optional reason
   * @param {Object} req - Optional request object for IP extraction
   */
  static async logRoleAssignment(userId, roleIds, assignedBy, reason = '', req) {
    try {
      await prisma.AuditLog.create({
        data: {
          UserID: userId,
          Action: 'ROLE_ASSIGNMENT',
          Module: 'role_management',
          Details: JSON.stringify({
            roleIds,
            assignedBy,
            reason,
            timestamp: new Date(),
            action: 'ASSIGN'
          }),
          IPAddress: this.getClientIP(req),
          UserAgent: this.getUserAgent()
        }
      });
    } catch (error) {
      console.error('Error logging role assignment:', error);
      // Don't throw error as audit logging shouldn't break main functionality
    }
  }

  /**
   * Log role removal from a user
   * @param {number} userId - User ID
   * @param {Array} roleIds - Array of role IDs
   * @param {string} removedBy - User who removed the role
   * @param {string} reason - Optional reason
   * @param {Object} req - Optional request object for IP extraction
   */
  static async logRoleRemoval(userId, roleIds, removedBy, reason = '', req) {
    try {
      await prisma.AuditLog.create({
        data: {
          UserID: userId,
          Action: 'ROLE_REMOVAL',
          Module: 'role_management',
          Details: JSON.stringify({
            roleIds,
            removedBy,
            reason,
            timestamp: new Date(),
            action: 'REMOVE'
          }),
          IPAddress: this.getClientIP(req),
          UserAgent: this.getUserAgent()
        }
      });
    } catch (error) {
      console.error('Error logging role removal:', error);
    }
  }

  /**
   * Log permission change for a role
   * @param {number} roleId - Role ID
   * @param {number} permissionId - Permission ID
   * @param {boolean} granted - Whether permission was granted or denied
   * @param {number} changedBy - User who changed the permission
   * @param {string} reason - Optional reason
   * @param {Object} req - Optional request object for IP extraction
   */
  static async logPermissionChange(roleId, permissionId, granted, changedBy, reason = '', req) {
    try {
      await prisma.AuditLog.create({
        data: {
          UserID: changedBy,
          Action: 'PERMISSION_CHANGE',
          Module: 'role_management',
          Details: JSON.stringify({
            roleId,
            permissionId,
            granted,
            reason,
            timestamp: new Date(),
            action: granted ? 'GRANT' : 'DENY'
          }),
          IPAddress: this.getClientIP(req),
          UserAgent: this.getUserAgent()
        }
      });
    } catch (error) {
      console.error('Error logging permission change:', error);
    }
  }

  /**
   * Log role creation
   * @param {Object} roleData - Role data
   * @param {number} createdBy - User who created the role
   * @param {Object} req - Optional request object for IP extraction
   */
  static async logRoleCreation(roleData, createdBy, req) {
    try {
      await prisma.AuditLog.create({
        data: {
          UserID: createdBy,
          Action: 'ROLE_CREATION',
          Module: 'role_management',
          Details: JSON.stringify({
            roleData,
            timestamp: new Date(),
            action: 'CREATE'
          }),
          IPAddress: this.getClientIP(req),
          UserAgent: this.getUserAgent()
        }
      });
    } catch (error) {
      console.error('Error logging role creation:', error);
    }
  }

  /**
   * Log role modification
   * @param {number} roleId - Role ID
   * @param {Object} oldData - Old role data
   * @param {Object} newData - New role data
   * @param {number} modifiedBy - User who modified the role
   * @param {Object} req - Optional request object for IP extraction
   */
  static async logRoleModification(roleId, oldData, newData, modifiedBy, req) {
    try {
      await prisma.AuditLog.create({
        data: {
          UserID: modifiedBy,
          Action: 'ROLE_MODIFICATION',
          Module: 'role_management',
          Details: JSON.stringify({
            roleId,
            oldData,
            newData,
            timestamp: new Date(),
            action: 'MODIFY'
          }),
          IPAddress: this.getClientIP(req),
          UserAgent: this.getUserAgent()
        }
      });
    } catch (error) {
      console.error('Error logging role modification:', error);
    }
  }

  /**
   * Log role deletion
   * @param {number} roleId - Role ID
   * @param {Object} roleData - Role data before deletion
   * @param {number} deletedBy - User who deleted the role
   * @param {string} reason - Optional reason
   * @param {Object} req - Optional request object for IP extraction
   */
  static async logRoleDeletion(roleId, roleData, deletedBy, reason = '', req) {
    try {
      await prisma.AuditLog.create({
        data: {
          UserID: deletedBy,
          Action: 'ROLE_DELETION',
          Module: 'role_management',
          Details: JSON.stringify({
            roleId,
            roleData,
            reason,
            timestamp: new Date(),
            action: 'DELETE'
          }),
          IPAddress: this.getClientIP(req),
          UserAgent: this.getUserAgent()
        }
      });
    } catch (error) {
      console.error('Error logging role deletion:', error);
    }
  }

  /**
   * Log user authentication events
   * @param {number} userId - User ID
   * @param {string} action - Authentication action (LOGIN, LOGOUT, etc)
   * @param {Object} details - Optional additional details
   * @param {Object} req - Optional request object for IP extraction
   */
  static async logAuthentication(userId, action, details = {}, req) {
    try {
      await prisma.AuditLog.create({
        data: {
          UserID: userId,
          Action: action,
          Module: 'authentication',
          Details: JSON.stringify({
            ...details,
            timestamp: new Date()
          }),
          IPAddress: this.getClientIP(req),
          UserAgent: this.getUserAgent()
        }
      });
    } catch (error) {
      console.error('Error logging authentication:', error);
    }
  }

  /**
   * Log system configuration changes
   * @param {string} configKey - Configuration key
   * @param {*} oldValue - Old configuration value
   * @param {*} newValue - New configuration value
   * @param {number} changedBy - User who changed the configuration
   * @param {Object} req - Optional request object for IP extraction
   */
  static async logSystemConfigChange(configKey, oldValue, newValue, changedBy, req) {
    try {
      await prisma.AuditLog.create({
        data: {
          UserID: changedBy,
          Action: 'SYSTEM_CONFIG_CHANGE',
          Module: 'system_configuration',
          Details: JSON.stringify({
            configKey,
            oldValue,
            newValue,
            timestamp: new Date()
          }),
          IPAddress: this.getClientIP(req),
          UserAgent: this.getUserAgent()
        }
      });
    } catch (error) {
      console.error('Error logging system config change:', error);
    }
  }

  /**
   * Get audit logs with filters
   */
  static async getAuditLogs(filters = {}) {
    try {
      const where = {};

      if (filters.userId) where.UserID = parseInt(filters.userId);
      if (filters.action) where.Action = filters.action;
      if (filters.module) where.Module = filters.module;
      if (filters.startDate) where.CreatedAt = { gte: new Date(filters.startDate) };
      if (filters.endDate) where.CreatedAt = { lte: new Date(filters.endDate) };

      const logs = await prisma.AuditLog.findMany({
        where,
        include: {
          User: {
            select: {
              FirstName: true,
              LastName: true,
              Email: true
            }
          }
        },
        orderBy: {
          CreatedAt: 'desc'
        },
        take: filters.limit || 100,
        skip: filters.offset || 0
      });

      return logs;
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      throw error;
    }
  }

  /**
   * Get the latest audit log for a specific entity
   * @param {string} module - Module name (e.g., 'study_plans', 'student_management')
   * @param {string} entity - Entity name (e.g., 'MasterStudyPlanner', 'StudentStudyPlanner')
   * @param {string|number} entityId - Entity ID to search for
   * @returns {Object|null} Latest audit log or null if not found
   */
  static async getLatestAuditForEntity(module, entity, entityId) {
    try {
      console.log('=== getLatestAuditForEntity Debug ===');
      console.log('Module:', module);
      console.log('Entity:', entity);
      console.log('EntityId:', entityId);

      // Fetch all logs for this module and filter manually
      const allLogs = await prisma.AuditLog.findMany({
        where: {
          Module: module
        },
        include: {
          User: {
            select: {
              FirstName: true,
              LastName: true,
              Email: true
            }
          }
        },
        orderBy: {
          CreatedAt: 'desc'
        }
      });

      // Fetch user roles if we have logs
      let userRoles = {};
      if (allLogs.length > 0) {
        const userEmails = [...new Set(allLogs.map(log => log.User?.Email).filter(Boolean))];
        if (userEmails.length > 0) {
          const userProfiles = await prisma.UserProfile.findMany({
            where: {
              UserEmail: { in: userEmails }
            },
            include: {
              UserRoles: {
                include: {
                  Role: {
                    select: {
                      Name: true,
                      Color: true
                    }
                  }
                }
              }
            }
          });

          // Create a map of email to roles
          userProfiles.forEach(profile => {
            const roles = profile.UserRoles.map(ur => ur.Role.Name);
            userRoles[profile.UserEmail] = roles;
          });
        }
      }

      console.log('Total logs in module:', allLogs.length);

      // Filter logs by parsing JSON and matching entityId
      const logs = allLogs.filter(log => {
        try {
          const details = typeof log.Details === 'string' ? JSON.parse(log.Details) : log.Details;
          const match = details.entityId === entityId;
          if (match) {
            console.log('Found matching log with entityId:', details.entityId);
          }
          return match;
        } catch (e) {
          return false;
        }
      });

      console.log('Filtered logs count:', logs.length);
      if (logs.length > 0) {
        const details = typeof logs[0].Details === 'string' ? JSON.parse(logs[0].Details) : logs[0].Details;
        console.log('First matching log entityId:', details.entityId);
        console.log('First matching log user:', logs[0].User);
      }

      if (logs.length === 0) {
        console.log('No matching logs found for entityId:', entityId);
        return null;
      }

      const log = logs[0];
      const details = typeof log.Details === 'string' ? JSON.parse(log.Details) : log.Details;

      // Get roles for this user
      const userEmail = log.User?.Email || 'N/A';
      const roles = userRoles[userEmail] || [];

      // Determine user name - show "Developer" instead of "Unknown" for null users (DEV mode)
      let userName = 'Unknown';
      let displayEmail = userEmail;
      if (log.User) {
        userName = `${log.User.FirstName || ''} ${log.User.LastName || ''}`.trim();
      } else if (log.UserID === null || log.UserID === undefined) {
        // No user ID means this was likely done in DEV mode
        userName = 'Developer';
        displayEmail = 'developer@dev.local';
      }

      return {
        id: log.ID,
        userId: log.UserID,
        userName: userName,
        userEmail: displayEmail,
        userRoles: roles,
        action: log.Action,
        module: log.Module,
        timestamp: log.CreatedAt,
        details: details
      };
    } catch (error) {
      console.error('Error fetching latest audit log for entity:', error);
      return null;
    }
  }

  /**
   * Export audit logs for compliance reporting
   */
  static async exportAuditLogs(filters = {}, format = 'json') {
    try {
      const logs = await this.getAuditLogs(filters);

      if (format === 'csv') {
        return this.convertToCSV(logs);
      }

      return logs;
    } catch (error) {
      console.error('Error exporting audit logs:', error);
      throw error;
    }
  }

  /**
   * Convert audit logs to CSV format
   */
  static convertToCSV(logs) {
    const headers = ['Timestamp', 'User', 'Action', 'Module', 'Details', 'IP Address'];
    const csvRows = [headers.join(',')];

    logs.forEach(log => {
      const row = [
        log.CreatedAt.toISOString(),
        `${log.User?.FirstName || ''} ${log.User?.LastName || ''}`.trim(),
        log.Action,
        log.Module,
        `"${log.Details?.replace(/"/g, '""') || ''}"`,
        log.IPAddress || ''
      ];
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  /**
   * Get client IP address from request object
   * Handles various proxy headers and deployment scenarios
   * @param {Object} req - Next.js request object
   * @returns {string} Client IP address or 'unknown' if unavailable
   */
  static getClientIP(req) {
    if (!req) {
      return 'unknown';
    }

    try {
      // Check x-forwarded-for header (proxies, load balancers, CDNs)
      const xForwardedFor = req.headers?.get?.('x-forwarded-for') || req.headers?.['x-forwarded-for'];
      if (xForwardedFor) {
        // x-forwarded-for can contain multiple IPs, take the first one
        const ips = xForwardedFor.split(',').map(ip => ip.trim());
        if (ips.length > 0 && ips[0]) {
          return ips[0];
        }
      }

      // Check x-real-ip header (Nginx proxy)
      const xRealIp = req.headers?.get?.('x-real-ip') || req.headers?.['x-real-ip'];
      if (xRealIp) {
        return xRealIp;
      }

      // Check x-client-ip header (Cloudflare)
      const xClientIp = req.headers?.get?.('x-client-ip') || req.headers?.['x-client-ip'];
      if (xClientIp) {
        return xClientIp;
      }

      // Check cf-connecting-ip (Cloudflare)
      const cfConnectingIp = req.headers?.get?.('cf-connecting-ip') || req.headers?.['cf-connecting-ip'];
      if (cfConnectingIp) {
        return cfConnectingIp;
      }

      // Fall back to req.ip (direct connection)
      if (req.ip) {
        return req.ip;
      }

      // Last resort: try to get IP from socket
      if (req.socket?.remoteAddress) {
        return req.socket.remoteAddress;
      }

      // If nothing worked, return unknown
      return 'unknown';
    } catch (error) {
      console.error('Error extracting client IP:', error);
      return 'unknown';
    }
  }

  /**
   * Get user agent (placeholder - implement based on your setup)
   */
  static getUserAgent() {
    // This should be implemented based on your deployment setup
    // For now, return a placeholder
    return 'API';
  }
}
