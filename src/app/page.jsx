import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AuthApp from './AuthApp';
import { isLocalPlannerRequest } from '@utils/auth/localPlanner.mjs';

const page = async () => {
  if (isLocalPlannerRequest(await headers())) redirect('/view/dashboard');
  return (
    <div>
      <AuthApp />
    </div>
  );
};

export default page
