import { RateLimiterMemory } from 'rate-limiter-flexible';

/**
 * Rate limiting configuration for file uploads
 * Different limits based on user role to accommodate legitimate bulk operations
 * while preventing DoS attacks
 */

// Create separate rate limiters for each role tier
const adminRateLimiter = new RateLimiterMemory({
	points: 50, // 50 uploads per hour
	duration: 3600, // per hour
	blockDuration: 900, // 15 minute cooldown
	keyPrefix: 'upload_admin',
});

const dataManagerRateLimiter = new RateLimiterMemory({
	points: 50, // 50 uploads per hour
	duration: 3600,
	blockDuration: 900,
	keyPrefix: 'upload_datamanager',
});

const courseManagerRateLimiter = new RateLimiterMemory({
	points: 30, // 30 uploads per hour
	duration: 3600,
	blockDuration: 900,
	keyPrefix: 'upload_coursemanager',
});

const regularUserRateLimiter = new RateLimiterMemory({
	points: 20, // 20 uploads per hour
	duration: 3600,
	blockDuration: 900,
	keyPrefix: 'upload_regular',
});

const anonRateLimiter = new RateLimiterMemory({
	points: 5, // 5 uploads per hour for unauthenticated
	duration: 3600,
	blockDuration: 900,
	keyPrefix: 'upload_anon',
});

/**
 * Get the appropriate rate limiter based on user role
 * @param {string} userRole - The user's role (admin, data-manager, course-manager, etc.)
 * @returns {object} Object containing the limiter and limit info
 */
function getRateLimiterForRole(userRole) {
	const normalizedRole = userRole ? userRole.toLowerCase().trim() : null;

	if (normalizedRole === 'admin') {
		return {
			limiter: adminRateLimiter,
			limit: 50,
			role: 'admin',
		};
	}

	if (normalizedRole === 'data-manager' || normalizedRole === 'data_manager') {
		return {
			limiter: dataManagerRateLimiter,
			limit: 50,
			role: 'data-manager',
		};
	}

	if (normalizedRole === 'course-manager' || normalizedRole === 'course_manager') {
		return {
			limiter: courseManagerRateLimiter,
			limit: 30,
			role: 'course-manager',
		};
	}

	// Default for authenticated users
	return {
		limiter: regularUserRateLimiter,
		limit: 20,
		role: 'regular-user',
	};
}

/**
 * Check if user has exceeded rate limit for uploads
 * @param {string} identifier - User email or IP address to track
 * @param {string} userRole - User's role for tier determination
 * @returns {Promise<object>} Object with allowed (boolean) and metadata
 */
export async function checkUploadRateLimit(identifier, userRole = null) {
	try {
		// Default to anonymous/IP-based rate limit if no role
		const rateLimitConfig = userRole
			? getRateLimiterForRole(userRole)
			: {
					limiter: anonRateLimiter,
					limit: 5,
					role: 'anonymous',
				};

		const limiter = rateLimitConfig.limiter;
		const maxPoints = rateLimitConfig.limit;

		try {
			// Attempt to consume 1 point for this upload
			const res = await limiter.consume(identifier, 1);

			return {
				allowed: true,
				remaining: Math.floor(res.remainingPoints),
				limit: maxPoints,
				role: rateLimitConfig.role,
				resetTime: new Date(Date.now() + res.msBeforeNext).toISOString(),
			};
		} catch (rateLimiterRes) {
			// Rate limit exceeded
			return {
				allowed: false,
				remaining: 0,
				limit: maxPoints,
				role: rateLimitConfig.role,
				retryAfter: Math.ceil(rateLimiterRes.msBeforeNext / 1000),
				resetTime: new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString(),
				message: `Rate limit exceeded. Your role allows ${maxPoints} uploads per hour.`,
			};
		}
	} catch (error) {
		// If rate limiting fails for any reason, allow the request but log the error
		console.error('Rate limiter error:', error);
		return {
			allowed: true,
			remaining: null, // Unknown
			limit: null,
			error: 'Rate limiting unavailable',
		};
	}
}

/**
 * Get rate limit status for a user (for informational purposes)
 * @param {string} identifier - User email or IP address
 * @param {string} userRole - User's role
 * @returns {Promise<object>} Current rate limit status
 */
export async function getUploadRateLimitStatus(identifier, userRole = null) {
	try {
		const rateLimitConfig = userRole
			? getRateLimiterForRole(userRole)
			: {
					limiter: anonRateLimiter,
					limit: 5,
					role: 'anonymous',
				};

		const limiter = rateLimitConfig.limiter;

		// Get penalty info without consuming points
		const penalty = await limiter.get(identifier);

		if (!penalty) {
			return {
				remaining: rateLimitConfig.limit,
				limit: rateLimitConfig.limit,
				role: rateLimitConfig.role,
				resetTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
			};
		}

		return {
			remaining: Math.max(0, Math.floor(rateLimitConfig.limit - penalty.consumedPoints)),
			limit: rateLimitConfig.limit,
			role: rateLimitConfig.role,
			resetTime: new Date(Date.now() + penalty.msBeforeNext).toISOString(),
		};
	} catch (error) {
		console.error('Error getting rate limit status:', error);
		return {
			error: 'Could not retrieve rate limit status',
		};
	}
}

export default {
	checkUploadRateLimit,
	getUploadRateLimitStatus,
};
