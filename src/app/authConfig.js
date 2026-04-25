import { LogLevel } from '@azure/msal-browser';

////        REEAAAADD !!11!!!!!11!!    ////

// npm install @azure/msal-browser @azure/msal-react --force
// npm install react-bootstrap bootstrap --force
//  ^^ this will cause a lot of errors cause this microsoft library only supports up to React 18, we're using 19
// Worst case scenario we'd have to just downgrade our react app to 18


//This is the config files for the pages' microsoft login


export const msalConfig = {
    auth: {
        clientId: process.env.NEXT_PUBLIC_CLIENT_ID,
        authority: process.env.NEXT_PUBLIC_AUTHORITY, // Do not spread my tenant ID pleaASE !!!!!!!!!!
        redirectUri: process.env.NEXT_PUBLIC_REDIRECTURI, // Points to window.location.origin. You  must register this URI on Microsoft Entra admin center/App Registration.
        postLogoutRedirectUri: process.env.NEXT_PUBLIC_POSTLOGOUTREDIRECTURI, // Indicates the page to navigate after logout.
        navigateToLoginRequestUrl: true, // If "true", will navigate back to the original request location before processing the auth code response.
    },
    cache: {
        cacheLocation: 'localStorage', // Configures cache location. "localStorage" gives you SSO between tabs.
        storeAuthStateInCookie: true, // Set this to "true" if you are having issues on IE11 or Edge
    },
    system: {
        loggerOptions: {
            loggerCallback: (level, message, containsPii) => {
                if (containsPii) {
                    return;
                }
                switch (level) {
                    case LogLevel.Error:
                        console.error(message);
                        return;
                    case LogLevel.Info:
                        console.info(message);
                        return;
                    case LogLevel.Verbose:
                        console.debug(message);
                        return;
                    case LogLevel.Warning:
                        console.warn(message);
                        return;
                    default:
                        return;
                }
            },
        },
    },
};

export const loginRequest = {
    scopes: ['user.read'],
};

export const graphConfig = {
    graphMeEndpoint: "https://graph.microsoft.com/v1.0/me"
};

