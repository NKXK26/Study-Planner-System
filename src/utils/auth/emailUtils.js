// Email utility functions for user management
// Provides email normalization and validation without domain restrictions

export function normalizeEmail(email) {
	return (email || "").trim().toLowerCase();
}

export function getEmailDomain(email) {
	const e = normalizeEmail(email);
	const atIndex = e.lastIndexOf("@");
	return atIndex === -1 ? "" : e.slice(atIndex + 1);
}

export function validateEmail(email) {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(normalizeEmail(email));
}

export default {
	normalizeEmail,
	getEmailDomain,
	validateEmail
};


