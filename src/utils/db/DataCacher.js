import localforage from "localforage";

const cacheStore = localforage.createInstance({
	name: "StudentStudyPlannerCache"
});

export default class DataCacher {
	//Cache for 1 day
	static DEFAULT_TTL_SECONDS = 180;

	_getKey(url) {
		return CleanURL(url);
	}

	_getBaseResourcePath(url) {
		const apiPrefix = '/api/';

		// 1. Start by getting the path without query strings
		const pathWithoutQuery = url.split('?')[0];

		// 2. Ensure it starts with the API prefix
		if (!pathWithoutQuery.startsWith(apiPrefix)) {
			return pathWithoutQuery;
		}

		// 3. Find the index where the resource name starts (after '/api/')
		const startOfResourceIndex = pathWithoutQuery.indexOf(apiPrefix) + apiPrefix.length;

		// 4. Get the part that includes the resource and sub-path (e.g., "students/123/history")
		const resourceAndSubpath = pathWithoutQuery.substring(startOfResourceIndex);

		// 5. Find the next slash (which marks the end of the base resource)
		const endOfBaseIndex = resourceAndSubpath.indexOf('/');

		let baseResource;

		if (endOfBaseIndex === -1) {
			// Case A: No slash found (e.g., "students")
			baseResource = resourceAndSubpath;
		} else {
			// Case B: Slash found (e.g., "students/123/history")
			baseResource = resourceAndSubpath.substring(0, endOfBaseIndex);
		}

		// 6. Reconstruct the base key: /api/resource
		return apiPrefix + baseResource;
	}


	async ValidateCache(value, key) {
		if (!value) {
			return { success: false, data: null };
		}

		const currentTime = Date.now();

		if (currentTime > value.expiryTime) {
			await this.ClearCache(key);
			console.log(`Cache entry expired and removed for key: ${key}`);
			return { success: false, data: null };
		}

		return { success: true, data: value.data };
	}

	async GetCache(url) {
		if (!url) {
			return null; // Return null instead of a structured error object for cleaner API
		}
		const key = this._getKey(url);

		try {
			const val = await cacheStore.getItem(key);

			const validateCache = await this.ValidateCache(val, key);

			if (validateCache.success) {
				return validateCache.data;
			}

			return null; // Cache Miss (missing or stale)

		} catch (err) {
			console.error(`Error fetching or validating cache for key ${key}:`, err);
			// Treat any storage error as a cache miss
			return null;
		}
	}

	async SetCache(url, data, ttl = DataCacher.DEFAULT_TTL_SECONDS) {
		const key = this._getKey(url);

		// Calculate the absolute expiration timestamp
		const currentTime = Date.now();
		const ttlInMs = ttl * 1000;
		const expiryTime = currentTime + ttlInMs;

		const cacheEntry = {
			data: data,
			expiryTime: expiryTime
		};

		try {
			await cacheStore.setItem(key, cacheEntry);
			console.log(`Cache set successfully for key: ${key}`);
			return true;
		} catch (err) {
			console.error(`Error setting cache for key ${key}:`, err);
			return false;
		}
	}

	async RemoveInvalidationKey(url) {
		const keysToInvalidate = [];

		const key = this._getKey(url);
		// This returns something like "/api/students"
		const baseKeyForInvalidation = this._getBaseResourcePath(key);

		// Check if the calculated base key is valid
		if (!baseKeyForInvalidation.startsWith('/api/')) {
			console.warn(`Could not determine valid API base path for: ${url}`);
			return [];
		}

		const allCachedKeys = await cacheStore.keys();

		console.log('cache test url', url)
		console.log('cache test baseKeyForInvalidation', baseKeyForInvalidation)
		console.log('cache test allCachedKeys', allCachedKeys)

		for (const key of allCachedKeys) {
			// We use startsWith to catch:
			// 1. The base list: "/api/students"
			// 2. Filtered lists: "/api/students?status=active..."
			// 3. Sub-resources: "/api/students/123/history"
			if (key.startsWith(baseKeyForInvalidation)) {
				keysToInvalidate.push(key);
				await this.ClearCache(key);
			}
		}
		console.log('cache test keysToInvalidate', keysToInvalidate)

		// Optional: Log what's being invalidated for debugging
		console.log(`Invalidating cache for base resource: ${baseKeyForInvalidation}. Keys found: ${keysToInvalidate.length}`);

		return keysToInvalidate;
	}

	async ClearCache(key) {
		try {
			// Use await directly
			await cacheStore.removeItem(key);
			return true;
		} catch (err) {
			console.error(`Error removing cache for key ${key}:`, err);
			return false;
		}
	}

	async ClearAllCache() {
		try {
			await cacheStore.clear();
			console.log('Clearing all cache.');
			return true;
		} catch (err) {
			console.error(err);
			return false;
		}
	}
}

function CleanURL(url) {
	const urlParts = url.split('?');
	const pathAndQuery = urlParts[0].startsWith('http')
		? urlParts[0].replace(/^(?:https?:\/\/[^\/]+)/, '')
		: urlParts[0];

	let cleaned_url = pathAndQuery;
	let queryParams = '';

	// 2. Handle Query Parameters
	if (urlParts.length > 1) {
		queryParams = urlParts.slice(1).join('?');

		if (queryParams) {
			const params = new URLSearchParams(queryParams);
			const sortedParams = Array.from(params.keys()).sort().map(key => {
				return params.getAll(key).map(value =>
					`${key}=${encodeURIComponent(value)}`
				).join('&');
			});

			if (sortedParams.length > 0) {
				cleaned_url += '?' + sortedParams.join('&');
			}
		}
	}

	if (cleaned_url && !cleaned_url.startsWith('/')) {
		cleaned_url = '/' + cleaned_url;
	}

	return cleaned_url;
}