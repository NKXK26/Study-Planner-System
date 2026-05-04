'use client';
import { usePathname } from 'next/navigation';
import SidebarLayout from '@components/SidebarLayout';
import { RoleProvider } from '@app/context/RoleContext';
// import LightDarkMode from '@styles/LightDarkMode';
import msalInstance from '@app/msalInstance';
import { useEffect, useState } from 'react';

export default function ClientLayout({ children }) {
	const pathname = usePathname();
	const isLoginPage = pathname === '/';
	const [isAuthenticated, setIsAuthenticated] = useState(false);

	useEffect(() => {
		const checkAuth = async () => {
			await msalInstance.initialize();
			const accounts = msalInstance.getAllAccounts();
			setIsAuthenticated(accounts.length > 0 || localStorage.getItem('userProfile'));
		};
		checkAuth();
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
