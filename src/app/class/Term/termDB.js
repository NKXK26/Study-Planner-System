import Term from "./term";
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

class TermDB {
    static async FetchTerms(params = {}) {
        try {
            // Constructing the query parameters
            const query = new URLSearchParams({
                ...params,
                ...(params.order_by ? { order_by: JSON.stringify(params.order_by) } : {}),
                ...(params.return ? { return: params.return.join(',') } : {}),
                ...(params.exclude ? { exclude: JSON.stringify(params.exclude) } : {})
            }).toString();
            // Fetch the data from the API

            const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/term?${query}`);

            // Get the response content regardless of status
            const textResponse = await response.text();

            // Try to parse as JSON
            let data;
            try {
                data = JSON.parse(textResponse);
            } catch (e) {
                console.error('Failed to parse response as JSON:', textResponse);
                throw new Error(`Failed to parse response from server: ${textResponse}`);
            }

            // Check if the response is ok
            if (!response.ok) {
                // console.error('API returned error:', data);
                // throw new Error(data.message || `Server error: ${response.status}`);
                return {
                    success: false,
                    message: `Failed to parse response from server: ${textResponse}`
                };
            }

            // Handle both array and object-with-data API responses
            const arr = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
            const terms = arr.map(termData => new Term(
                termData.ID,
                termData.Name,
                termData.Year,
                termData.Month,
                termData.SemType,
                termData.Status
            ));
            return {
                success: true,
                data: terms,
                pagination: data.pagination || null
            };
        } catch (error) {
            console.error('Error fetching terms:', error);
            throw error;
        }
    }
    static async AddTerm(term) {
        try {
            const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/term`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(term),
            });

            // Get the response content regardless of status
            const textResponse = await response.text();

            // Try to parse as JSON
            let data;
            try {
                data = JSON.parse(textResponse);
            } catch (e) {
                console.error('Failed to parse response as JSON:', textResponse);
                return {
                    success: false,
                    message: `Failed to parse response from server: ${textResponse}`
                };
            }

            // Always return the response data
            return {
                success: response.ok,
                message: data.message || (response.ok ? "Term added successfully" : "Failed to add term"),
                term: data.term,
                details: data.details,
                status: response.status
            };
        } catch (err) {
            console.error('addTerm error:', err);
            return { success: false, message: err.message };
        }
    }

    // THIS IS WHERE YOU EDIT THE TERM
    static async UpdateTerm(term) {
        try {
            const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/term`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(term)

            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status !== 200) {
                    console.warn('Term already exists:', data.term);
                    return { success: false, message: data.message, term: data.term };
                }
                throw new Error(data.error || 'Failed to edit the term');
            }

            return {
                success: true,
                message: 'Term has been edited successfully.',
                term: data.term,
            };
        } catch (err) {
            console.error('EditTerm Error:', err);
            return { success: false, message: err.message };
        }
    }
    //THIS IS WHERE U DELETE THE

    static async DeleteTerm(id) {
        const response = await SecureFrontendAuthHelper.authenticatedFetch("/api/term", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: id }),
        });
        return await response.json();
    }

}



export default TermDB;