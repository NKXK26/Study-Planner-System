"use client";

import React, { Component } from 'react';
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { msalConfig } from './authConfig';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';
import LoadingSpinner from '@components/LoadingSpinner';
class AuthApp extends Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
      isAuthenticated: false,
      user: {},
      isInitialized: false,
      isLoggingIn: false,
      processingLogin: false,
      userProfile: null,
    };

    this.login = this.login.bind(this);
    this.logout = this.logout.bind(this);
    this.devModeLogin = this.devModeLogin.bind(this);

    // Create the MSAL application object
    this.publicClientApplication = new PublicClientApplication(msalConfig);
  }

  componentDidMount() {
    // Initialize the MSAL application when component mounts
    this.publicClientApplication.initialize().then(() => {
      // Handle redirect promise after login
      this.publicClientApplication.handleRedirectPromise().then(() => {
        const accounts = this.publicClientApplication.getAllAccounts();

        if (accounts.length > 0) {
          // Check if user has valid session in our backend
          this.validateBackendSession(accounts[0]);
        } else {
          this.setState({ isInitialized: true });
        }
      });
    }).catch(error => {
      console.error("Failed to initialize MSAL:", error);
      this.setState({
        error,
        isInitialized: true
      });
    });
  }
  async validateBackendSession(msalAccount) {
    try {
      // Check if we have user profile stored locally
      const storedProfile = localStorage.getItem('userProfile');
      if (storedProfile) {
        const profile = JSON.parse(storedProfile);
        this.setState({
          isAuthenticated: true,
          user: msalAccount,
          userProfile: profile,
          isInitialized: true
        });

        this.publicClientApplication.setActiveAccount(msalAccount);
        return;
      }

      // No stored profile, proceed to normal flow
      this.setState({ isInitialized: true });

    } catch (error) {
      console.error("Session validation error:", error);
      this.setState({ isInitialized: true });
    }
  }
  async login() {
    try {
      // Prevent multiple login attempts
      if (this.state.isLoggingIn || !this.state.isInitialized) {
        console.log("Login already in progress or not initialized");
        return;
      }

      this.setState({ isLoggingIn: true });

      // STEP 1: MSAL Authentication
      const response = await this.publicClientApplication.loginPopup({
        scopes: ["User.Read"],
        prompt: "select_account"
      });

      console.log('response', response)

      console.log("MSAL authentication successful:", response.account.username);

      // STEP 2: CALL YOUR BACKEND (this was missing!)
      await this.processBackendLogin(response.account, response.idToken);

    } catch (err) {
      // Only set error state if it's not a user cancellation
      if (err.name !== "BrowserAuthError" || !err.message.includes("user_cancelled")) {
        this.setState({
          error: err
        });
        console.error("Login error:", err);
        this.showErrorMessage(err.message);
      }
    } finally {
      this.setState({ isLoggingIn: false });
    }
  }
  async processBackendLogin(msalAccount, idToken) {
    this.setState({ processingLogin: true });

    try {
      console.log("Processing backend authentication for:", msalAccount.username);

      // Call your user-login endpoint
      const response = await fetch('/api/auth/user-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: msalAccount.username,
          name: msalAccount.name,
          token: idToken
        })
      });

      const data = await response.json();

      // Handle inactive user account (403 status)
      if (response.status === 403) {

        this.showInactiveAccountMessage(data.error);
        // Clear local session without popup (to avoid popup blocker issues)
        localStorage.removeItem('userProfile');
        this.setState({
          isAuthenticated: false,
          user: {},
          userProfile: null
        });
        return;
      }

      if (data.success) {
        console.log('data', data)
        console.log("Backend authentication successful:", data);

        // Store user profile for session persistence
        const userProfile = {
          userId: data.userId,
          userProfileId: data.userProfileId,
          email: msalAccount.username,
          roles: data.roles,
          msalAccount: {
            name: msalAccount.name,
            username: msalAccount.username
          }
        };
        localStorage.setItem('sessionToken', data.sessionToken)
        localStorage.setItem('sessionUser', JSON.stringify(data.sessionUser))
        localStorage.setItem('userProfile', JSON.stringify(userProfile));

        // Update state
        this.setState({
          isAuthenticated: true,
          user: msalAccount,
          userProfile: userProfile,
          error: null
        });

        this.publicClientApplication.setActiveAccount(msalAccount);

        // Show success message with role info
        this.showSuccessMessage(userProfile);

        // Redirect to dashboard after brief delay
        setTimeout(() => {
          window.location.href = '/view/dashboard';
        }, 2000);

      } else {
        throw new Error(data.error || 'Authentication failed');
      }

    } catch (error) {
      console.error("Backend authentication error:", error);

      // Handle error cases
      this.showErrorMessage(error.message);

      // Logout from MSAL on backend failure
      await this.logout();

    } finally {
      this.setState({ processingLogin: false });
    }
  }

  // Show success message with role information
  showSuccessMessage(userProfile) {
    if (window.Swal) {
      window.Swal.fire({
        title: 'Welcome!',
        html: `
          <div style="text-align: left;">
            <p><strong>Email:</strong> ${userProfile.email}</p>
            <p><strong>Assigned Roles:</strong> ${userProfile.roles.join(', ')}</p>
            <p style="color: #059669; margin-top: 10px;"><strong>✓ Authentication successful!</strong></p>
          </div>
        `,
        icon: 'success',
        timer: 3000,
        showConfirmButton: false
      });
    }
  }

  // Show inactive account message
  showInactiveAccountMessage(message) {
    if (window.Swal) {
      window.Swal.fire({
        title: 'Account Inactive',
        html: `
          <div style="text-align: center;">
            <p style="font-size: 16px; margin-bottom: 15px;">${message || 'Your account has been deactivated.'}</p>
            <p style="color: #dc2d27; font-weight: 600;">Please contact an administrator for assistance.</p>
          </div>
        `,
        icon: 'warning',
        confirmButtonText: 'OK',
        confirmButtonColor: '#dc2d27'
      });
    }
  }

  // Show generic error message
  showErrorMessage(message) {
    if (window.Swal) {
      window.Swal.fire({
        title: 'Authentication Failed',
        text: message,
        icon: 'error',
        confirmButtonText: 'Try Again'
      });
    }
  }
  // DEV MODE LOGIN BYPASS
  async devModeLogin() {
    try {
      console.log("🔧 DEV MODE: Bypassing authentication");

      // Create a fake dev user profile
      const devProfile = {
        userId: 'dev_override',
        userProfileId: 'dev_override',
        email: 'developer@dev.local',
        roles: ['Superadmin'],
        msalAccount: {
          name: 'Developer (Dev Mode)',
          username: 'developer@dev.local'
        }
      };
      const { sessionToken, sessionUser } = SecureSessionManager.CreateSession(null, true)

      console.log('sessionToken', sessionToken)
      console.log('sessionUser', sessionUser)


      // Store in session
      localStorage.setItem('userProfile', JSON.stringify(devProfile));
      localStorage.setItem('sessionToken', sessionToken)
      localStorage.setItem('sessionUser', JSON.stringify(sessionUser))

      // Update state
      this.setState({
        isAuthenticated: true,
        user: { username: 'developer@dev.local', name: 'Developer' },
        userProfile: devProfile,
        error: null
      });

      // Show dev mode message
      if (window.Swal) {
        window.Swal.fire({
          title: '🔧 Dev Mode Active',
          html: `
            <div style="text-align: left;">
              <p><strong>Email:</strong> developer@dev.local</p>
              <p><strong>Roles:</strong> Superadmin</p>
              <p style="color: #dc2d27; margin-top: 10px;"><strong>⚠️ Development Override Enabled</strong></p>
            </div>
          `,
          icon: 'info',
          timer: 2000,
          showConfirmButton: false
        });
      }

      // Redirect to dashboard
      setTimeout(() => {
        window.location.href = '/view/dashboard';
      }, 2000);

    } catch (error) {
      console.error("Dev mode login error:", error);
    }
  }

  //latest
  async logout() {
    try {
      // Clear session storage first
      localStorage.clear();

      // Update state immediately
      this.setState({
        isAuthenticated: false,
        user: {},
        userProfile: null
      });

      try {
        // Try popup logout, but if it fails (popup blocker), use redirect instead
        await this.publicClientApplication.logoutPopup({
          postLogoutRedirectUri: "/"
        });
      } catch (popupErr) {
        // If popup fails (blocked by browser), use redirect logout as fallback
        if (popupErr.name === 'BrowserAuthError' && popupErr.message.includes('popup')) {
          console.log("Popup blocked, using redirect logout instead");
          await this.publicClientApplication.logoutRedirect({
            postLogoutRedirectUri: "/"
          });
        } else {
          throw popupErr;
        }
      }
    } catch (err) {
      console.error("Logout Error:", err);
      // Even if logout fails, ensure local state is cleared
      this.setState({
        isAuthenticated: false,
        user: {},
        userProfile: null
      });
    }
  }

  render() {
    if (!this.state.isInitialized) {
      return <LoadingSpinner fullScreen={true} />;
    }

    if (this.state.isAuthenticated) {
      window.location.href = '/view/dashboard';
    }


    return (
      <div className="h-screen w-screen relative">
        <div
          className="absolute inset-0 z-0 bg-[url('/images/Website-banner-scaled.jpg')] bg-center bg-cover bg-no-repeat"
        />
        <div
          className="absolute inset-0 z-1 bg-gradient-to-r from-white/60 to-white/80"
        />
        <div className="relative z-2 flex h-full w-full justify-center items-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl text-center w-full max-w-md transform transition-all duration-300 hover:shadow-2xl">
            <img
              src="/images/login-banner.jpg"
              alt="Study Desk"
              className="w-full h-48 object-cover mb-6 rounded-lg shadow-md"
            />
            <h1 className="text-gray-800 mb-2 text-6xl font-light tracking-tight">WELCOME</h1>
            <div className="w-64 h-0.5 bg-[#dc2d27] mx-auto mt-3 mb-3"></div>
            <h2 className="text-[#dc2d27] mb-8 text-2xl font-semibold">Student Study Planner</h2>
            <p className="text-gray-600 mb-8 text-sm">
              Sign in with your Microsoft account to access the system
            </p>
            <button
              className="bg-[#dc2d27] text-white border-none py-3.5 px-8 rounded-lg text-base font-medium cursor-pointer transition-all duration-300 hover:bg-red-700 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 w-full flex items-center justify-center gap-2"
              onClick={this.login}
              disabled={this.state.isLoggingIn}
            >
              {this.state.isLoggingIn ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Logging in...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12 8V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M8 12H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Sign in with Microsoft</span>
                </>
              )}
            </button>

            {/* DEV MODE BYPASS BUTTON */}
            {process.env.NEXT_PUBLIC_MODE === 'DEV' && (
              <div className="mt-4">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">Development Mode</span>
                  </div>
                </div>
                <button
                  className="mt-4 bg-orange-500 text-white border-none py-2.5 px-6 rounded-lg text-sm font-medium cursor-pointer transition-all duration-300 hover:bg-orange-600 hover:scale-105 w-full flex items-center justify-center gap-2"
                  onClick={this.devModeLogin}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.976 17.0657 20.1235 17.2863 20.2241 17.5291C20.3248 17.7719 20.3766 18.0322 20.3766 18.295C20.3766 18.5578 20.3248 18.8181 20.2241 19.0609C20.1235 19.3037 19.976 19.5243 19.79 19.71C19.6043 19.896 19.3837 20.0435 19.1409 20.1441C18.8981 20.2448 18.6378 20.2966 18.375 20.2966C18.1122 20.2966 17.8519 20.2448 17.6091 20.1441C17.3663 20.0435 17.1457 19.896 16.96 19.71L16.9 19.65C16.6643 19.4195 16.365 19.2648 16.0406 19.206C15.7162 19.1472 15.3816 19.1869 15.08 19.32C14.7842 19.4468 14.532 19.6572 14.3543 19.9255C14.1766 20.1938 14.0813 20.5082 14.08 20.83V21C14.08 21.5304 13.8693 22.0391 13.4942 22.4142C13.1191 22.7893 12.6104 23 12.08 23C11.5496 23 11.0409 22.7893 10.6658 22.4142C10.2907 22.0391 10.08 21.5304 10.08 21V20.91C10.0723 20.579 9.96512 20.258 9.77251 19.9887C9.5799 19.7194 9.31074 19.5143 9 19.4C8.69838 19.2669 8.36381 19.2272 8.03941 19.286C7.71502 19.3448 7.41568 19.4995 7.18 19.73L7.12 19.79C6.93425 19.976 6.71368 20.1235 6.47088 20.2241C6.22808 20.3248 5.96783 20.3766 5.705 20.3766C5.44217 20.3766 5.18192 20.3248 4.93912 20.2241C4.69632 20.1235 4.47575 19.976 4.29 19.79C4.10405 19.6043 3.95653 19.3837 3.85588 19.1409C3.75523 18.8981 3.70343 18.6378 3.70343 18.375C3.70343 18.1122 3.75523 17.8519 3.85588 17.6091C3.95653 17.3663 4.10405 17.1457 4.29 16.96L4.35 16.9C4.58054 16.6643 4.73519 16.365 4.794 16.0406C4.85282 15.7162 4.81312 15.3816 4.68 15.08C4.55324 14.7842 4.34276 14.532 4.07447 14.3543C3.80618 14.1766 3.49179 14.0813 3.17 14.08H3C2.46957 14.08 1.96086 13.8693 1.58579 13.4942C1.21071 13.1191 1 12.6104 1 12.08C1 11.5496 1.21071 11.0409 1.58579 10.6658C1.96086 10.2907 2.46957 10.08 3 10.08H3.09C3.42099 10.0723 3.742 9.96512 4.0113 9.77251C4.28059 9.5799 4.48572 9.31074 4.6 9C4.73312 8.69838 4.77282 8.36381 4.714 8.03941C4.65519 7.71502 4.50054 7.41568 4.27 7.18L4.21 7.12C4.02405 6.93425 3.87653 6.71368 3.77588 6.47088C3.67523 6.22808 3.62343 5.96783 3.62343 5.705C3.62343 5.44217 3.67523 5.18192 3.77588 4.93912C3.87653 4.69632 4.02405 4.47575 4.21 4.29C4.39575 4.10405 4.61632 3.95653 4.85912 3.85588C5.10192 3.75523 5.36217 3.70343 5.625 3.70343C5.88783 3.70343 6.14808 3.75523 6.39088 3.85588C6.63368 3.95653 6.85425 4.10405 7.04 4.29L7.1 4.35C7.33568 4.58054 7.63502 4.73519 7.95941 4.794C8.28381 4.85282 8.61838 4.81312 8.92 4.68H9C9.29577 4.55324 9.54802 4.34276 9.72569 4.07447C9.90337 3.80618 9.99872 3.49179 10 3.17V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.09C14.0013 3.41179 14.0966 3.72618 14.2743 3.99447C14.452 4.26276 14.7042 4.47324 15 4.6C15.3016 4.73312 15.6362 4.77282 15.9606 4.714C16.285 4.65519 16.5843 4.50054 16.82 4.27L16.88 4.21C17.0657 4.02405 17.2863 3.87653 17.5291 3.77588C17.7719 3.67523 18.0322 3.62343 18.295 3.62343C18.5578 3.62343 18.8181 3.67523 19.0609 3.77588C19.3037 3.87653 19.5243 4.02405 19.71 4.21C19.896 4.39575 20.0435 4.61632 20.1441 4.85912C20.2448 5.10192 20.2966 5.36217 20.2966 5.625C20.2966 5.88783 20.2448 6.14808 20.1441 6.39088C20.0435 6.63368 19.896 6.85425 19.71 7.04L19.65 7.1C19.4195 7.33568 19.2648 7.63502 19.206 7.95941C19.1472 8.28381 19.1869 8.61838 19.32 8.92V9C19.4468 9.29577 19.6572 9.54802 19.9255 9.72569C20.1938 9.90337 20.5082 9.99872 20.83 10H21C21.5304 10 22.0391 10.2107 22.4142 10.5858C22.7893 10.9609 23 11.4696 23 12C23 12.5304 22.7893 13.0391 22.4142 13.4142C22.0391 13.7893 21.5304 14 21 14H20.91C20.5882 14.0013 20.2738 14.0966 20.0055 14.2743C19.7372 14.452 19.5268 14.7042 19.4 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>🔧 You are in Dev Mode - Click to Skip Login</span>
                </button>
              </div>
            )}

            {this.state.error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm animate-fade-in">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>{this.state.error.message}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

}

export default AuthApp;