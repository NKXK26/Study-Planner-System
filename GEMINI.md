# 🎓 Study Planner System - Project Documentation

## 🏗️ Project Architecture
The Study Planner System is a hybrid **Next.js** and **Electron** application. It serves as both a web-based platform and a cross-platform desktop application.

- **Frontend**: Next.js (App Router) with React. Provides a rich, interactive UI for planner management and visualization.
- **Backend**: Next.js API Routes. Handles business logic, database interactions, and integrations.
- **Desktop Wrapper**: Electron. Packages the Next.js application for desktop use, enabling local system integrations and offline capabilities.
- **Database**: SQLite managed via Prisma ORM for local-first data persistence.
- **Cloud Integration**: Supabase is used for supplementary storage (e.g., PDF exports) and potentially managed data services.
- **Auth**: Microsoft Authentication Library (MSAL) for Azure AD integration.

## 🛠️ Technology Stack
- **Framework**: Next.js 15+, React 18
- **Desktop**: Electron
- **Database/ORM**: SQLite, Prisma
- **Auth**: @azure/msal-react, @azure/msal-browser
- **Styling**: Tailwind CSS, Bootstrap 5, CSS Modules
- **Visualizations**: Cytoscape.js, React Flow, Vis.js
- **PDF Processing**: pdf-parse, pdfjs-dist, PyMuPDF (backend dependencies)
- **Utilities**: SweetAlert2 (Modals), ExcelJS (XLSX export), Papaparse (CSV)

## 📁 Important Directories
- `src/app`: Core Next.js application logic (App Router).
- `src/app/api`: Backend API endpoints.
- `src/app/view`: Frontend pages and main feature views.
- `src/app/class`: Business logic abstractions and domain models.
- `src/app/libs`: Specialized utility libraries (e.g., checker logic, rules).
- `src/components`: Shared React components.
- `electron`: Electron main process and configuration files.
- `prisma`: Database schema and migrations.
- `scripts`: Database seeding, setup, and maintenance scripts.
- `supabase`: Supabase configuration and migrations.

## 📄 Important Files
- `prisma/schema.prisma`: The "Source of Truth" for the database model.
- `electron/main.js`: Entry point for the Electron desktop application.
- `src/app/layout.jsx`: Root layout handling theme and global providers.
- `src/app/ClientLayout.jsx`: Client-side wrapper for RBAC and MSAL initialization.
- `src/app/AuthApp.jsx`: Main authentication component.
- `src/utils/db/db.js`: Prisma client initialization.
- `src/utils/db/supabaseClient.js`: Supabase client configuration.

## 🗄️ Database Structure
The system uses a relational SQLite database. Key entities include:
- **Course & Major**: Academic structures.
- **Unit**: Individual subjects with credit points and availability.
- **Student**: User profiles with intake and major information.
- **StudyPlanner & MasterStudyPlanner**: Structures for organizing units into semesters.
- **UnitHistory**: Tracks student progress (completed units).
- **RBAC (Roles, Permissions, UserRoles)**: Comprehensive access control system.
- **UnitRequisiteRelationship**: Manages prerequisites and corequisites.

## 🔐 Authentication Flow
1. **Login**: Users authenticate via Microsoft MSAL (`AuthApp.jsx`).
2. **Backend Sync**: Upon successful MSAL login, the frontend calls `/api/auth/user-login`.
3. **Session**: A session is established, and user profiles (including roles) are stored in `localStorage`.
4. **RBAC**: `RoleContext` provides permission-based access control throughout the UI.
5. **Dev Mode**: A bypass is available in development environments for quick testing.

## 🚀 Major Features
- **PDF Planner Import**: Automatically extract units and types from PDF study planners.
- **Interactive Planner**: Drag-and-drop or structured unit selection for student study plans.
- **Rule Validation**: Real-time checking of prerequisites and course requirements.
- **Change of Major Simulation**: Visualize how current progress applies to a different degree.
- **Graduation Checker**: Automated verification of all degree requirements.
- **AI Assistant**: Conversational agent to help navigate unit selection and planning.
- **RBAC Management**: Granular control over user roles and system permissions.

## 💻 Development Commands
- `npm run dev`: Start the Next.js development server.
- `npm run electron:dev`: Build and launch the Electron application in development mode.
- `npm run db:setup`: Initialize the database, run migrations, and seed data.
- `npm run db:seed`: Populate the database from seed files.
- `npm run build`: Build the Next.js production bundle.
- `npm run electron:build`: Package the application for distribution (Windows).

## 📝 Project Conventions
- **API Responses**: Standardized JSON responses with `success`, `data`, or `error` fields.
- **Components**: Prefer functional components with hooks.
- **Permissions**: Use `PermissionLoadingWrapper` or similar to gate UI elements.
- **Styling**: Use Tailwind for layout/spacing; Bootstrap components for complex widgets (where already established).
- **File Naming**: Next.js standard naming for routes; camelCase for utilities/classes.
