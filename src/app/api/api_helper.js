import SecureSessionManager from "@utils/auth/SimpleSessionManager";

export function TokenValidation(authHeader) {
	const sessionToken = authHeader?.replace('Bearer ', '');
	if (!sessionToken) {
		return {success: false, session: null, message: 'No token provided' , status: 401 };
	}

	const { session, success } = SecureSessionManager.ValidateSession(sessionToken);

	if (!success) {
		return {success: false, session: session, message: 'Session Token is invalid' , status: 401 };
	}else{
		return {success: true, session: session, message: 'Session is validated' , status: 200 };
	}

}