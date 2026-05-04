"use client";
import { useState, useEffect, useRef } from "react";
import { useRole } from "@app/context/RoleContext";
import { useLightDarkMode } from "@app/context/LightDarkMode";
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";
import Nav from "@components/nav";
import { ConditionalRequireAuth } from "./helper";
import { usePathname } from "next/navigation";
// import { PublicClientApplication } from "@azure/msal-browser";
// import { msalConfig } from "@app/authConfig";
import msalInstance from "@app/msalInstance";
import RoleBubble from "./RoleBubble";
import DataCacher from "@utils/db/DataCacher";
//import Link from "next/link";

const SidebarLayout = ({ children, onLogout, isAuthenticated }) => {
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  // Role context
  const { roles: allRoles, selectedRoleName, setSelectedRoleByName, resetOverride, can, canSwitchRoles, userActualRoles } = useRole();
  // Light/Dark mode context
  const { theme, toggleThemeLightDark, mounted: themeMounted } = useLightDarkMode();
  const sidebarWidth = 250;
  const sidebarRef = useRef(null);
  const toggleButtonRef = useRef(null);
  //const pathname = usePathname();

  // Check if user can switch roles (from context or localStorage as fallback)
  const canUserSwitchRoles = canSwitchRoles || (typeof window !== 'undefined' && localStorage.getItem('canSwitchRoles') === 'true');

  useEffect(() => {
    setMounted(true);

    // Add click outside listener
    const handleClickOutside = (event) => {
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target) &&
        toggleButtonRef.current &&
        !toggleButtonRef.current.contains(event.target)
      ) {
        setSidebarOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // use context methods for apply/reset

  //sidebar width
  /*
    // Function to generate breadcrumbs based on current path
    const generateBreadcrumbs = () => {
      // hide breadcrumbs on home page
      if (pathname === "/") {
        return null;
      }

      // Split the path into segments
      const segments = pathname.split("/").filter(segment => segment);

      // Create the breadcrumb items
      const breadcrumbs = [];
      let path = "";

      // Add Home as the first breadcrumb
      breadcrumbs.push({
        name: "Home",
        path: "/",
      });

      // Process segments to create path hierarchy
      segments.forEach((segment, index) => {
        path = `${path}/${segment}`;

        // Format the segment name (replace hyphens with spaces and capitalize)
        const formattedName = segment
          .replace(/-/g, " ")
          .replace(/_/g, " ")
          .replace(/\b\w/g, char => char.toUpperCase());

        breadcrumbs.push({
          name: formattedName,
          path: path,
          isLast: index === segments.length - 1,
        });
      });

      return breadcrumbs;
    };

    const breadcrumbs = generateBreadcrumbs();
  */
  const handleLogout = onLogout || (async () => {
    try {
      // const msalInstance = new PublicClientApplication(msalConfig);
      await msalInstance.initialize();

      const account = msalInstance.getAllAccounts()[0];
      if (!account) {
        console.warn("No account found to log out");
        return;
      }
      let DataCacherObject = new DataCacher();

      DataCacherObject.ClearAllCache();
      localStorage.clear();
      await msalInstance.logoutRedirect({
        account,
        postLogoutRedirectUri: "/"
      });
    } catch (error) {
      console.error("Logout failed:", error);
      alert("Logout failed. See console for details");
    }
  });

  return (
    <div className="flex flex-col h-screen overflow-auto">
      {/* Top Header - Always visible */}
      <header className="bg-black border-b py-3 px-4 flex items-center justify-between shadow-sm z-50 relative">
        {/* Hamburger button and Logo */}
        <div className="flex items-center gap-4">
          {/* Auth for burger icon to be hide if not signed in */}
          {(isAuthenticated || process.env.NEXT_PUBLIC_MODE == "DEV") && (
            <div ref={toggleButtonRef}>
              <button
                className="p-2 rounded focus:outline-none"
                onClick={toggleSidebar}
                aria-label="Toggle menu"
              >
                <svg
                  width="24"
                  height="24"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`text-[#ffffff] cursor-pointer transition-transform duration-300 ${sidebarOpen ? 'rotate-90' : ''}`}
                >
                  {sidebarOpen ? (
                    <>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </>
                  ) : (
                    <>
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="18" x2="21" y2="18" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          )}

          {/* Logo auth, to make the logo a div instead of href when clicked on for non users */}
          {(isAuthenticated || process.env.NEXT_PUBLIC_MODE == "DEV") ? (
            //This is the logo when the user HAS LOGGED IN
            <a href="/view/dashboard" className="hover:opacity-80 transition-opacity">
              <img src="/images/swinburne_logo.png" alt="Logo" className="h-[2rem] w-auto"></img>
            </a>
          ) : (
            // This is the logo when user is not logged in
            <div>
              <img src="/images/swinburne_logo.png" alt="Logo" className="h-[2rem] w-auto"></img>
            </div>
          )}
          {/* Site Title */}
          <h1 className="text-lg font-semibold text-[#ffffff]">Student Study Planner System</h1>
        </div>

        {/* Account, Light/Dark Mode, and Role section */}
        <div className="flex items-center gap-4">
          {/* Light/Dark Mode Toggle - visible to all */}
          {themeMounted && (
            <button
              onClick={toggleThemeLightDark}
              className="p-2 rounded-full hover:bg-gray-700/50 transition-colors duration-200"
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? (
                <MoonIcon className="h-6 w-6 text-white" />
              ) : (
                <SunIcon className="h-6 w-6 text-yellow-400" />
              )}
            </button>
          )}

          {/* Account Icon - visible to all authenticated users */}
          {(isAuthenticated || process.env.NEXT_PUBLIC_MODE == "DEV") && (
            <a
              href="/view/account"
              className="p-2 rounded-full hover:bg-gray-700/50 transition-colors duration-200"
              title="Account Information"
            >
              <svg
                className="h-6 w-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </a>
          )}

          {/* Role selection - visible only to Superadmin users, in DEV mode, or when explicitly in role override mode */}
          {(
            (isAuthenticated && canUserSwitchRoles) ||
            (typeof window !== 'undefined' && localStorage.getItem('devRoleOverride') === '1') ||
            (process.env.NEXT_PUBLIC_MODE === 'DEV')
          ) && (
              <div className="sm:flex hidden items-center gap-2">
                <label className="text-white text-sm hidden sm:block">
                  {typeof window !== 'undefined' && localStorage.getItem('devRoleOverride') === '1'
                    ? 'Viewing as:'
                    : process.env.NEXT_PUBLIC_MODE === 'DEV'
                      ? 'DEV Role:'
                      : 'Role:'
                  }
                </label>
                <select
                  className="text-sm rounded-md px-3 py-1 bg-white"
                  value={selectedRoleName || ""}
                  onChange={(e) => setSelectedRoleByName(e.target.value)}
                >
                  {allRoles.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {typeof window !== 'undefined' && localStorage.getItem('devRoleOverride') === '1' && (
                  <button
                    className="ml-1 text-xs px-2 py-1 rounded bg-yellow-200 hover:bg-yellow-300 text-yellow-800 font-medium"
                    onClick={resetOverride}
                    title="Reset to your actual role"
                  >
                    Reset to Actual Role
                  </button>
                )}
                {typeof window !== 'undefined' && localStorage.getItem('devRoleOverride') === '1' && (
                  <span className="text-xs text-yellow-200 hidden sm:inline" title="Temporary role view for testing">
                    (Override)
                  </span>
                )}
                {process.env.NEXT_PUBLIC_MODE === 'DEV' && (
                  <span className="text-xs text-blue-300 hidden sm:inline" title="Developer mode active">
                    (DEV)
                  </span>
                )}
              </div>
            )}
        </div>
      </header>

      <RoleBubble
        allRoles={allRoles}
        selectedRoleName={selectedRoleName}
        setSelectedRoleByName={setSelectedRoleByName}
        resetOverride={resetOverride}
        canUserSwitchRoles={canUserSwitchRoles}
        isAuthenticated={isAuthenticated}
      />

      <div className="flex flex-1 overflow-hidden relative z-30">
        {/* Overlay when sidebar is open */}
        {sidebarOpen && (
          <div
            className="fixed inset-0  bg-opacity-50 transition-opacity z-30" style={{ backgroundColor: 'rgba(0, 0, 0,0.5)' }}
            aria-hidden="true"
          />
        )}

        {/* Sidebar - Absolute positioned */}
        <div
          ref={sidebarRef}
          className={`absolute left-0 h-[calc(100vh-57px)] bg-[#242323] shadow-lg transition-transform duration-300 ease-in-out z-40`}
          style={{
            width: `${sidebarWidth}px`,
            transform: sidebarOpen ? 'translateX(0)' : `translateX(-${sidebarWidth}px)`,
          }}
        >
          {mounted && (
            <div className="w-full h-full">
              <Nav onLinkClick={() => setSidebarOpen(false)} onLogout={handleLogout} can={can} pathname={pathname} />
            </div>
          )}
        </div>

        {/* Main Content - Always full width */}
        <div className="flex-1 overflow-auto">
          <main className="p-4">
            {/* Show role override warning for superadmin */}
            {typeof window !== 'undefined' && localStorage.getItem('devRoleOverride') === '1' && (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700">
                      <strong>Role Override Active:</strong> You are viewing the system as <strong>{selectedRoleName}</strong>.
                      Your actual role is <strong>{userActualRoles.join(', ')}</strong>.
                      This is a temporary view for testing purposes.
                      <button
                        onClick={resetOverride}
                        className="ml-2 text-yellow-800 underline hover:text-yellow-900"
                      >
                        Click here to return to your actual role
                      </button>
                    </p>
                  </div>
                </div>
              </div>
            )}
            

            {/* Check if user has dashboard access - only on dashboard page */}
            {/* {pathname === '/view/dashboard' && !can('dashboard', 'access') ? (
              <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                  <svg className="mx-auto h-16 w-16 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
                  <p className="text-gray-600 mb-4">You don't have permission to view the dashboard.</p>
                  <p className="text-sm text-gray-500">Required permission: dashboard:access</p>
                </div>
              </div>
            ) : (
              {children}
            )} */}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default SidebarLayout;
