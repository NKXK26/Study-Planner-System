'use client';
import { usePathname } from 'next/navigation';
import SidebarLayout from '@components/SidebarLayout';
import { RoleProvider } from '@app/context/RoleContext';
// import LightDarkMode from '@styles/LightDarkMode';
import msalInstance from '@app/msalInstance';
import Swal from 'sweetalert2';
import { useEffect, useState } from 'react';

export default function ClientLayout({ children }) {
	const pathname = usePathname();
	const isLoginPage = pathname === '/';
	const [isAuthenticated, setIsAuthenticated] = useState(false);

	useEffect(() => {
		// Preserve legacy window.Swal callers using the installed local package.
		window.Swal = Swal;
		const checkAuth = async () => {
			if (process.env.NEXT_PUBLIC_MODE === 'DEV' || localStorage.getItem('userProfile')) {
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
				{children}
			</SidebarLayout>
			{/* <LightDarkMode /> */}
		</RoleProvider>
	);
}
