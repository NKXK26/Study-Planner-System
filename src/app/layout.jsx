import '../styles/globals.css'
import ClientLayout from './ClientLayout';
import { headers } from 'next/headers';
import { isLocalPlannerRequest } from '@utils/auth/localPlanner.mjs';
import { LightDarkModeProvider } from './context/LightDarkMode'; //added lightdarkmode into the layout

export const metadata = {
	title: "Student Study Planner System",
	description: '',
	icons: {
		icon: "/images/favicon.png"
	},
}

export default async function RootLayout({ children }) {
	const localPlanner = isLocalPlannerRequest(await headers());
	return (
		<html lang='en' suppressHydrationWarning>
			<head>
				<script
					dangerouslySetInnerHTML={{
						__html: `
							(function() {
								try {
									const savedTheme = localStorage.getItem('theme');
									const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
									const theme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
									document.documentElement.classList.remove('light', 'dark');
									document.documentElement.classList.add(theme);
								} catch (e) {
									console.error('Theme initialization error:', e);
									document.documentElement.classList.add('light');
								}
							})();
						`,
					}}
				/>
			</head>
			<body data-local-planner={localPlanner ? 'true' : undefined}>
				<LightDarkModeProvider>
					<ClientLayout localPlanner={localPlanner}>
						{children}
					</ClientLayout>
				</LightDarkModeProvider>
			</body>
		</html>
	)
}
