import '../styles/globals.css'
import ClientLayout from './ClientLayout';
import { LightDarkModeProvider } from './context/LightDarkMode'; //added lightdarkmode into the layout

export const metadata = {
	title: "Student Study Planner System",
	description: '',
	icons: {
		icon: "/images/favicon.png"
	},
}

export default function RootLayout({ children }) {
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
				<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
			</head>
			<body>
				<LightDarkModeProvider>
					<ClientLayout>
						{children}
					</ClientLayout>
				</LightDarkModeProvider>
			</body>
		</html>
	)
}