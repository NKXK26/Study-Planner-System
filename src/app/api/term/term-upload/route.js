import { NextResponse } from 'next/server';
import prisma from "@utils/db/db";
import { TokenValidation } from "@app/api/api_helper";
import SecureSessionManager from "@utils/auth/SimpleSessionManager";
import AuditLogger from "@app/class/Audit/AuditLogger";
import { checkUploadRateLimit } from "@utils/rateLimiting/uploadRateLimiter";

// Helper function to validate term data
function validateTermData(term) {
	const errors = [];

	if (!term.name || typeof term.name !== 'string' || term.name.trim() === '') {
		errors.push('Term name is required');
	}

	// Check year is a valid number
	const year = parseInt(term.year);
	if (isNaN(year) || year < 2000) {
		errors.push('Year must be a valid number greater than or equal to 2000');
	}

	// Check month is a valid number between 1 and 12
	const month = parseInt(term.month);
	if (isNaN(month) || month < 1 || month > 12) {
		errors.push('Month must be a valid number between 1 and 12');
	}

	// Validate semester type
	if (!term.semtype || (term.semtype !== 'Long Semester' && term.semtype !== 'Short Semester')) {
		errors.push('Semester Type must be either "Long Semester" or "Short Semester"');
	}

	// Validate status
	const validStatuses = ['published', 'unpublished', 'unavailable'];
	const status = term.status ? term.status.toLowerCase() : '';
	if (!validStatuses.includes(status)) {
		errors.push('Status must be one of: Published, Unpublished, Unavailable');
	}

	return errors;
}

// Helper function to log operations
function logOperation(operation, details) {
	const timestamp = new Date().toISOString();
	console.log(`[${timestamp}] ${operation}: `, details);
}

export async function POST(req) {
	try {
		// Check for DEV override
		const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
			process.env.NEXT_PUBLIC_MODE === 'DEV';

		if (!isDevOverride) {
			const authHeader = req.headers.get('Authorization');
			const token_res = TokenValidation(authHeader);

			if (!token_res.success) {
				return NextResponse.json({ success: false, message: token_res.message }, { status: token_res.status });
			}
			// Require actor email for auditability
			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
		}

		// Check rate limit for uploads
		let rateLimitIdentifier = null;
		let userRole = null;
		try {
			const user = await SecureSessionManager.authenticateUser(req);
			if (user?.email) {
				rateLimitIdentifier = user.email;
				userRole = user.role;
			} else {
				// Fallback to IP address if user email not available
				rateLimitIdentifier = req.headers.get('x-forwarded-for') || req.ip || 'unknown';
			}

			const rateLimitCheck = await checkUploadRateLimit(rateLimitIdentifier, userRole);

			if (!rateLimitCheck.allowed) {
				return NextResponse.json(
					{
						success: false,
						message: rateLimitCheck.message,
						code: 'RATE_LIMIT_EXCEEDED',
						uploadsLimit: rateLimitCheck.limit,
						uploadsRemaining: rateLimitCheck.remaining,
						retryAfter: rateLimitCheck.retryAfter
					},
					{
						status: 429,
						headers: {
							'Retry-After': rateLimitCheck.retryAfter.toString()
						}
					}
				);
			}
		} catch (rateLimitError) {
			console.warn('Rate limit check failed:', rateLimitError?.message);
			// Continue if rate limit check fails - don't block the request
		}

		// Parse request body as JSON
		const requestText = await req.text();
		let requestData;

		try {
			requestData = JSON.parse(requestText);
		} catch (error) {
			console.error('JSON Parse Error:', error);
			console.log('Request text received:', requestText.substring(0, 200) + '...');

			return NextResponse.json(
				{
					success: false,
					message: `Failed to parse request data: ${error.message}`,
					receivedData: requestText.substring(0, 100) + '...'
				},
				{ status: 400 }
			);
		}

		if (!requestData || !Array.isArray(requestData.terms) || requestData.terms.length === 0) {
			return NextResponse.json(
				{
					success: false,
					message: 'No valid term data provided',
					receivedData: JSON.stringify(requestData)
				},
				{ status: 400 }
			);
		}

		// Enforce maximum array size to prevent memory exhaustion
		const MAX_TERMS_PER_REQUEST = 10000;
		if (requestData.terms.length > MAX_TERMS_PER_REQUEST) {
			return NextResponse.json(
				{
					success: false,
					message: `Cannot import more than ${MAX_TERMS_PER_REQUEST} terms at once. Received ${requestData.terms.length} terms. Please split your import into multiple smaller batches.`
				},
				{ status: 413 } // Payload Too Large
			);
		}

		const terms = requestData.terms;
		const importMode = requestData.mode || 'add'; // Default to 'add' if not specified

		const results = {
			success: true,
			total: terms.length,
			successful: 0,
			failed: 0,
			errors: [],
			replaced: false,
			timestamp: new Date().toISOString()
		};

		// Validate all terms first
		const validTerms = [];
		for (let i = 0; i < terms.length; i++) {
			const term = terms[i];

			// Validate term data
			const validationErrors = validateTermData(term);
			if (validationErrors.length > 0) {
				results.failed++;
				results.errors.push({
					index: i,
					name: term.name || 'Unknown',
					year: term.year || 'Unknown',
					month: term.month || 'Unknown',
					errors: validationErrors
				});
			} else {
				// Add to valid terms list
				validTerms.push({
					...term,
					Name: term.name.trim(),
					Year: parseInt(term.year),
					Month: parseInt(term.month),
					SemType: term.semtype,
					Status: term.status ?
						term.status.toLowerCase() :
						'unavailable'
				});
			}
		}
		// Handle replace mode (delete all existing terms)
		// if (importMode === 'replace') {
		//     try {
		//         // Count existing terms to confirm replacement
		//         const existingCount = await prisma.Term.count();

		//         // Log the delete operation
		//         logOperation('DELETE ALL TERMS', { count: existingCount });

		//         // Delete all existing terms
		//         await prisma.Term.deleteMany({});

		//         results.replaced = true;
		//         results.replacedCount = existingCount;

		//         console.log(`[${results.timestamp}] REPLACE MODE: Deleted ${existingCount} terms`);
		//     } catch (error) {
		//         console.error(`[${results.timestamp}] REPLACE MODE ERROR:`, error);
		//         return NextResponse.json(
		//             {
		//                 success: false,
		//                 message: 'Failed to replace existing terms. Import aborted.',
		//                 error: error.message
		//             },
		//             { status: 500 }
		//         );
		//     }
		// }

		// Process terms in batches for better performance
		try {
			if (validTerms.length > 0) {
				// Prepare data for batch operations
				const termsToCreate = [];
				const existingTermKeys = new Set();

				// Only check for existing terms in 'add' mode
				if (importMode === 'add') {
					// Build a query with all unique name/year/month combinations
					const uniqueCombinations = validTerms.map(t => ({
						Name: t.Name,
						Year: t.Year,
						Month: t.Month
					}));

					// Get all existing terms in one query
					const existingTerms = await prisma.Term.findMany({
						where: {
							OR: uniqueCombinations
						},
						select: {
							Name: true,
							Year: true,
							Month: true
						}
					});

					// Create a set of unique keys for quick lookup
					existingTerms.forEach(term => {
						const key = `${term.Name}-${term.Year}-${term.Month}`;
						existingTermKeys.add(key);
					});
				}

				// Filter out terms that already exist (in 'add' mode only)
				validTerms.forEach(term => {
					const key = `${term.Name}-${term.Year}-${term.Month}`;

					if (importMode === 'replace' || !existingTermKeys.has(key)) {
						termsToCreate.push({
							Name: term.Name,
							Year: term.Year,
							Month: term.Month,
							SemType: term.SemType,
							Status: term.Status.toLowerCase()
						});
					} else {
						// Term already exists, don't recreate it
						results.failed++;
						results.errors.push({
							name: term.name,
							year: term.year,
							month: term.month,
							errors: ['Term with this name, year, and month combination already exists']
						});

						logOperation('SKIP EXISTING TERM', {
							name: term.Name,
							year: term.Year,
							month: term.Month
						});
					}
				});

				// createMany my goat
				if (termsToCreate.length > 0) {
					logOperation('BATCH CREATE TERMS', { count: termsToCreate.length });

					// AUDIT CREATE
					try {
						const user = await SecureSessionManager.authenticateUser(req);
						const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
						await AuditLogger.logCreate({
							userId: user?.id || null,
							email: actorEmail,
							module: 'term_management',
							entity: 'Term',
							entityId: `Batch Import - ${termsToCreate.length} terms`,
							after: termsToCreate.map(t => `${t.Name} ${t.Year}-${t.Month}`),
							metadata: { importMode, count: termsToCreate.length },
						req
					});
					} catch (e) {
						console.warn('Audit CREATE Term Import failed:', e?.message);
					}

					await prisma.Term.createMany({
						data: termsToCreate,
						skipDuplicates: true
					});

					results.successful += termsToCreate.length;
				}
			}
		} catch (error) {
			console.error(`[${results.timestamp}] BATCH OPERATION ERROR:`, error);
			return NextResponse.json(
				{
					success: false,
					message: `Failed during batch term operations: ${error.message}`
				},
				{ status: 500 }
			);
		}

		// Generate appropriate message based on results
		if (results.failed > 0) {
			results.success = results.successful > 0;

			if (importMode === 'replace') {
				results.message = results.successful > 0
					? `Replaced ${results.replacedCount} terms with ${results.successful} new terms. ${results.failed} terms had errors.`
					: `Failed to replace terms. All ${results.failed} import operations failed.`;
			} else {
				results.message = results.successful > 0
					? `Successfully added ${results.successful} of ${results.total} terms with ${results.failed} errors.`
					: `Failed to process any terms. Found ${results.failed} errors.`;
			}
		} else {
			if (importMode === 'replace') {
				results.message = `Successfully replaced ${results.replacedCount} terms with ${results.successful} new terms.`;
			} else {
				results.message = `Successfully added all ${results.total} terms.`;
			}
		}

		// Log the final result
		logOperation('IMPORT COMPLETED', {
			mode: importMode,
			total: results.total,
			successful: results.successful,
			failed: results.failed,
			success: results.success
		});

		return NextResponse.json(results, { status: 200 });
	} catch (error) {
		console.error('Error processing term upload:', error);
		return NextResponse.json(
			{
				success: false,
				message: 'Server error while processing term upload',
				error: error.message
			},
			{ status: 500 }
		);
	}
}
