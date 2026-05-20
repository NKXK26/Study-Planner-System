import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_DB_URL;
const supabaseKey = process.env.NEXT_PUBLIC_ANON_KEY;

// Guard against missing env vars — without this, the entire module crashes at import
// time on any page that imports `supabase`, breaking the page render. With this guard,
// the page still loads; only features that actually use supabase will fail gracefully.
let supabaseClient;
if (supabaseUrl && supabaseKey) {
	supabaseClient = createClient(supabaseUrl, supabaseKey);
} else {
	console.warn(
		"supabaseClient: NEXT_PUBLIC_DB_URL or NEXT_PUBLIC_ANON_KEY is not set in .env. " +
		"Supabase-dependent features (e.g. send_study_planner) will be unavailable."
	);
	const notConfiguredError = () => {
		throw new Error(
			"Supabase is not configured. Set NEXT_PUBLIC_DB_URL and NEXT_PUBLIC_ANON_KEY in .env."
		);
	};
	// Minimal stub that mimics the chainable Supabase API surface so callers don't crash
	// just by referencing methods. The error only fires if a method is actually invoked.
	supabaseClient = new Proxy({}, {
		get: () => notConfiguredError,
	});
}

export const supabase = supabaseClient;