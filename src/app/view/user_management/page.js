import WhitelistManagement from './WhitelistManagement';
import { ConditionalRequireAuth } from '@components/helper';

export default function UserManagementPage() {
    return (
        <ConditionalRequireAuth>
            <WhitelistManagement />
        </ConditionalRequireAuth>
    );
}
