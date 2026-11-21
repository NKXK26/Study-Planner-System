'use client';
import { usePathname } from 'next/navigation';
import SidebarLayout from '@components/SidebarLayout';
import { RoleProvider } from '@app/context/RoleContext';
// import LightDarkMode from '@styles/LightDarkMode';
import msalInstance from '@app/msalInstance';
import Swal from 'sweetalert2';
import { useEffect, useState } from 'react';
import { isStudentClientEdition } from '@app/libs/studentPortalAccess.mjs';

const studentWebEdition = isStudentClientEdition();

export default function ClientLayout({ children }) {
	const pathname = usePathname();
	const isLoginPage = pathname === '/';
	const [catalogueNotice,setCatalogueNotice] = useState('');
	useEffect(() => {
		if (pathname === '/view/compare_study_planner') return;
		let active = true;
		const refresh = async () => {
			try {
				const response = await fetch('/api/official-planners?status=1',{cache:'no-store'});
				const status = await response.json();
				if (active) setCatalogueNotice(status.warning || status.message || '');
			} catch { if (active) setCatalogueNotice('Planner catalogue unavailable.'); }
		};
		refresh();
		window.addEventListener('online', refresh);
		return () => { active = false; window.removeEventListener('online',refresh); };
	}, [pathname]);
	const [isAuthenticated, setIsAuthenticated] = useState(false);

	useEffect(() => {
		// Preserve legacy window.Swal callers using the installed local package.
		window.Swal = Swal;
		const checkAuth = async () => {
			if (studentWebEdition || process.env.NEXT_PUBLIC_MODE === 'DEV' || localStorage.getItem('userProfile')) {
				setIsAuthenticated(true);
				return;
			}
			await msalInstance.initialize();
			const accounts = msalInstance.getAllAccounts();
			setIsAuthenticated(accounts.length > 0 || localStorage.getItem('userProfile'));
		};
		checkAuth().catch(error => console.warn('Could not initialise account display:', error));
	}, []);
	return isLoginPage ? (
		<>
			{children}
			{/* <LightDarkMode /> */}
		</>
	) : (
		<RoleProvider>
			<SidebarLayout isAuthenticated={isAuthenticated}>
				{catalogueNotice && ['/view/dashboard','/view/graduation-eligibility','/view/ai-assistant'].includes(pathname) &&
					<p role="status" className="px-4 pt-2 text-sm text-amber-700">{catalogueNotice}</p>}
				{children}
			</SidebarLayout>
			{/* <LightDarkMode /> */}
		</RoleProvider>
	);
}
