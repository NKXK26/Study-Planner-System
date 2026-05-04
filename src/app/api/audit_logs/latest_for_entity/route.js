import { NextResponse } from 'next/server';
import AuditLogger from '@app/class/Audit/AuditLogger';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';
import { TokenValidation } from '@app/api/api_helper';
export async function GET(req) {
    try {
        // Authentication check
        const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
            process.env.NEXT_PUBLIC_MODE === 'DEV';

        if (!isDevOverride) {
			const authHeader = req.headers.get('Authorization');
			const token_res = TokenValidation(authHeader);

            console.log('token_res', token_res)
			if (!token_res.success) {
				return NextResponse.json({ success: false, message: token_res.message }, { status: token_res.status });
			}
            const sessionEmail = req.headers.get('x-session-email');
            if (!sessionEmail) {
                return NextResponse.json(
                    { success: false, message: 'Missing authentication header x-session-email' },
                    { status: 401 }
                );
            }
        }

        const { searchParams } = new URL(req.url);
        const module = searchParams.get('module');
        const entity = searchParams.get('entity');
        const entityId = searchParams.get('entityId');

        if (!module || !entity || !entityId) {
            return NextResponse.json(
                { success: false, message: 'Missing required parameters: module, entity, and entityId are required' },
                { status: 400 }
            );
        }

        const lastModified = await AuditLogger.getLatestAuditForEntity(module, entity, entityId);

        return NextResponse.json({
            success: true,
            lastModified
        });
    } catch (error) {
        console.error('Error fetching latest audit log:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

