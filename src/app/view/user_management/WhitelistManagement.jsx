'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
	PlusIcon,
	UserIcon,
	TrashIcon,
	ShieldCheckIcon,
	PencilIcon
} from '@heroicons/react/24/outline';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import RoleAssignmentModal from '../../../components/RoleAssignmentModal'; // IMPORT THE NEW RBAC MODAL
import UserEditModal from '../../../components/UserEditModal'; // IMPORT USER EDIT MODAL
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import { ConditionalRequireAuth } from '@components/helper';
import LoadingSpinner from '@components/LoadingSpinner';
import InfoTooltip from '@components/InfoTooltip';
import ActionButton from '@components/ActionButton';
const WhitelistManagement = () => {
	const { can, userActualRoles } = useRole();
	const [users, setUsers] = useState([]);
	const [roles, setRoles] = useState([]);
	const [loading, setLoading] = useState(true);
	const [fetchingUsers, setFetchingUsers] = useState(false); // Separate state for fetching users in table
	const [searchTerm, setSearchTerm] = useState('');
	const [filterRole, setFilterRole] = useState('all');
	const [filterStatus, setFilterStatus] = useState('all');
	const [showAddForm, setShowAddForm] = useState(false);
	const [editingUser, setEditingUser] = useState(null);
	// NEW RBAC MODAL STATE
	const [showRBACModal, setShowRBACModal] = useState(false);
	// USER EDIT MODAL STATE
	const [showEditModal, setShowEditModal] = useState(false);
	const [pageError, setPageError] = useState("")
	const [deleteLoading, setDeleteLoading] = useState({});
	const [currentUserEmail, setCurrentUserEmail] = useState('');
	const [isAddingUser, setIsAddingUser] = useState(false);

	const [formData, setFormData] = useState({
		email: '',
		firstName: '',
		lastName: '',
		selectedRoleId: ''
	});

	useEffect(() => {
		if (typeof window !== 'undefined' && window.localStorage) {
			try {
				const userProfile = localStorage.getItem("userProfile");
				if (userProfile) {
					const profile = JSON.parse(userProfile);
					setCurrentUserEmail(profile?.email || '');
				}
			} catch (error) {
				console.error('Error reading from localStorage:', error);
			}
		}
	}, []);

	// Filter roles to exclude Superadmin for non-Superadmin users
	const availableRoles = useMemo(() => {
		// Check if current user has Superadmin role (case-insensitive)
		const isSuperadmin = userActualRoles.some(role =>
			role.toLowerCase() === 'superadmin'
		);

		// If user is not Superadmin, filter out Superadmin role from the list
		if (!isSuperadmin) {
			return roles.filter(role => role.Name.toLowerCase() !== 'superadmin');
		}

		// If user is Superadmin, return all roles
		return roles;
	}, [roles, userActualRoles]);

	// Check if user has permission to access this page
	const hasPermission = can('user', 'read');

	useEffect(() => {
		if (hasPermission) {
			fetchUsers();
			fetchRoles();
		} else {
			// If user doesn't have permission, stop loading immediately
			setLoading(false);
		}
	}, [hasPermission]);

	// UPDATED FETCHUSERS TO INCLUDE RBAC ROLE DATA
	const fetchUsers = async () => {
		setFetchingUsers(true); // Set fetching state for table loading
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/users?action=list&includeRBACRoles=true');
			const data = await response.json();
			console.log('Users API response:', data);
			if (data.success && data.users) {
				setUsers(data.users);
				console.log('Users set:', data.users);
			} else {
				console.log('Users data format not recognized:', data);
			}
		} catch (error) {
			setPageError(error);
			console.error('Error fetching users:', error);
		} finally {
			setLoading(false); // Only set main loading to false on first load
			setFetchingUsers(false); // Always set fetching to false
		}
	};

	const fetchRoles = async () => {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/roles');
			const data = await response.json();
			console.log('Roles API response:', data);

			let rolesData = Array.isArray(data) ? data : data.roles;
			if (rolesData) {
				setRoles(rolesData);
				console.log('Roles set:', rolesData);
				// Set default role to Viewer if available
				const viewerRole = rolesData.find(role => role.Name === 'Viewer');
				if (viewerRole) {
					setFormData(prev => ({ ...prev, selectedRoleId: viewerRole.ID.toString() }));
				}
			} else {
				console.log('Roles data format not recognized:', data);
			}
		} catch (error) {
			console.error('Error fetching roles:', error);
		}
	};

	const showAlert = (title, text, icon = 'success') => {
		if (window.Swal) {
			window.Swal.fire({
				title,
				text,
				icon,
				timer: icon === 'success' ? 2000 : undefined,
				showConfirmButton: icon !== 'success'
			});
		}
	};

	const handleAddUser = async (e) => {
		setIsAddingUser(true);
		e.preventDefault();

		if (!formData.email.trim()) {
			showAlert('Error', 'Email is required', 'error');
			return;
		}

		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'create',
					email: formData.email,
					firstName: formData.firstName,
					lastName: formData.lastName,
					roleIds: formData.selectedRoleId ? [parseInt(formData.selectedRoleId)] : []
				}),
			});

			const data = await response.json();
			if (data.success) {
				setShowAddForm(false);
				setFormData({ email: '', firstName: '', lastName: '', selectedRoleId: '' });
				// Refresh the users list
				await fetchUsers();
				showAlert('Success!', 'User added successfully');
			} else {
				showAlert('Error', data.error || 'Error adding user', 'error');
			}
		} catch (error) {
			console.error('Error adding user:', error);
			showAlert('Error', 'Error adding user', 'error');
		} finally {
			setIsAddingUser(false);
		}
	};

	// NEW RBAC ROLE ASSIGNMENT HANDLER
	const handleRBACRoleAssignment = () => {
		fetchUsers(); // Refresh users after role assignment
		setShowRBACModal(false);
		setEditingUser(null);
		showAlert('Success!', 'User roles assigned successfully');
	};

	// USER EDIT HANDLER
	const handleUserEdit = () => {
		fetchUsers(); // Refresh users after edit
		setShowEditModal(false);
		setEditingUser(null);
	};

	const handleDeleteUser = async (userId, userName) => {
		// Show confirmation dialog
		if (window.Swal) {
			const result = await window.Swal.fire({
				title: 'Are you sure?',
				text: `Do you want to delete user "${userName}"? This action cannot be undone.`,
				icon: 'warning',
				showCancelButton: true,
				confirmButtonColor: '#dc2d27',
				cancelButtonColor: '#6b7280',
				confirmButtonText: 'Yes, delete it!',
				cancelButtonText: 'Cancel'
			});

			if (result.isConfirmed) {
				setDeleteLoading(prev => ({ ...prev, [userId]: true }));

				try {
					const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/users', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ action: 'delete', userId }),
					});

					const data = await response.json();
					if (data.success) {
						await fetchUsers();
						showAlert('Success!', 'User deleted successfully');
					} else {
						const errorMessage = data.error || data.message || 'Failed to delete user';
						showAlert('Error', 'Error deleting user: ' + errorMessage, 'error');
					}
				} catch (error) {
					console.error('Error deleting user:', error);
					showAlert('Error', 'Error deleting user: ' + error.message, 'error');
				} finally {
					// Always reset loading state for this user
					setDeleteLoading(prev => ({ ...prev, [userId]: false }));
				}
			}
		}
	};

	// const currentUserEmail = typeof window !== 'undefined'
	//     ? JSON.parse(localStorage.getItem("userProfile") || '{}')?.email
	//     : null;

	const filteredUsers = users
  .filter(user => {
    const matchesSearch =
      user.FirstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.LastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.Email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole =
      filterRole === "all" ||
      user.RBACRoles?.some(role => role.Role.Name === filterRole) ||
      user.Roles?.some(role => role.Name === filterRole) ||
      user.UserGroupAccess?.Name === filterRole;

    const matchesStatus =
      filterStatus === "all" || user.Status === filterStatus;

    return matchesSearch && matchesRole && matchesStatus;
  })
  .sort((a, b) => {
    if (a.Email === currentUserEmail) return -1;
    if (b.Email === currentUserEmail) return 1;

    if (a.Status !== b.Status) {
      return a.Status === "active" ? -1 : 1;
    }

    const aIsSuperadmin = a.RBACRoles?.some(r => r.Role.Name.toLowerCase() === "superadmin");
    const bIsSuperadmin = b.RBACRoles?.some(r => r.Role.Name.toLowerCase() === "superadmin");

    if (aIsSuperadmin !== bIsSuperadmin) {
      return aIsSuperadmin ? -1 : 1;
    }

    // 4️⃣ Sort by FirstName alphabetically
    return a.FirstName.localeCompare(b.FirstName);
  });

	if (loading) {
		return (
			<LoadingSpinner
				size="large"
				color="primary"
				text="Loading user management..."
				fullScreen={true}
			/>
		);
	}

	return (
		<ConditionalRequireAuth>
			{/* 
// <div className="page-bg fixed inset-0 overflow-auto z-10" style={{ paddingTop: '57px' }}>
//     <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
//         {/* Header 
//         <div className="card-bg shadow-theme border-divider border-b mb-6">
//             <div className="px-6 py-8">
//                 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
//                     <div className="flex items-center gap-4">
//                         <div className="p-3 bg-[#dc2d27]/10 rounded-lg">
//                             <UserIcon className="h-8 w-8 text-[#dc2d27]" />
//                         </div>
//                         <div>
//                             <h1 className="text-3xl font-bold heading-text mb-1">User Management</h1>
//                             <p className="text-muted text-sm">Manage user access and role assignments</p> */}

			<div className="fixed inset-0 page-bg overflow-auto z-10" style={{ paddingTop: '57px' }}>
				<div className="max-w-7xl mx-auto px-4 py-8">
					{/* Header */}
					<div className="card-bg shadow-sm border-b border-divider">
						<div className="max-w-7xl mx-auto px-4 py-6">
							<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
								<div className="flex items-center space-x-3">
									<div className="p-2 bg-[#dc2d27]/10 rounded-lg">
										<UserIcon className="h-8 w-8 text-[#dc2d27]" />
									</div>
									<div>
										<h1 className="text-3xl font-bold text-primary">User Management</h1>
										<p className="text-muted">Manage user access and role assignments</p>

									</div>
								</div>

								{can('user', 'create') && (
									<button
										onClick={() => setShowAddForm(true)}
										className="w-full sm:w-auto px-6 py-2.5 rounded-lg transition-colors flex items-center justify-center sm:justify-start gap-2 font-medium btn-primary whitespace-nowrap"
									>
										<PlusIcon className="w-5 h-5" />
										Add User
									</button>
								)}
							</div>
						</div>
					</div>

					{/* Main Content */}
					<div className="space-y-5">
						{/* Search and Filters */}
						<div className="card-bg rounded-lg shadow-sm border border-divider p-6">
							<div className="flex flex-col sm:flex-row gap-4">
								<div className="flex-1">
									<input
										type="text"
										placeholder="Search users..."
										value={searchTerm}
										onChange={(e) => setSearchTerm(e.target.value)}
										className="search-bar w-full"
									// className="input-field w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#dc2d27] focus:border-transparent"
									/>
								</div>
								<div className="flex gap-3 w-full sm:w-auto">
									<select
										value={filterRole}
										onChange={(e) => setFilterRole(e.target.value)}
										className="flex-1 sm:flex-none select-field px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#dc2d27] focus:border-[#dc2d27]"
									>
										<option value="all">All Roles</option>
										{availableRoles.map(role => (
											<option key={role.ID} value={role.Name}>{role.Name}</option>
										))}
									</select>
									<select
										value={filterStatus}
										onChange={(e) => setFilterStatus(e.target.value)}
										className="flex-1 sm:flex-none select-field px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#dc2d27] focus:border-[#dc2d27]"
									>
										<option value="all">All Status</option>
										<option value="active">Active</option>
										<option value="inactive">Inactive</option>
									</select>
								</div>
							</div>
						</div>

						{/* Add User Form Modal */}
						{showAddForm && can('user', 'create') && (
							// <div className="modal-backdrop flex items-center justify-center z-50 p-4">
							//     <div className="modal-bg p-8 rounded-theme shadow-xl w-full max-w-md">
							//         <h3 className="text-xl font-semibold heading-text mb-6 flex items-center gap-3">
							//             <PlusIcon className="w-6 h-6 text-[#dc2d27]" />
							<div className="modal-backdrop">
								<div className="modal-bg p-6 rounded-lg w-full max-w-md">
									<h3 className="text-lg font-medium text-primary mb-4 flex items-center gap-2">
										<PlusIcon className="w-5 h-5 text-[#dc2d27]" />
										Add New User
									</h3>

									<form onSubmit={handleAddUser}>
										<div className="space-y-5">
											<div>
												<label className="label-text block text-sm font-medium mb-2">
													Email Address *
												</label>
												<input
													type="email"
													value={formData.email}
													onChange={(e) => setFormData({ ...formData, email: e.target.value })}
													className="input-field w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dc2d27] focus:border-transparent"
													placeholder="user@swinburne.edu.my"
													required
												/>
											</div>

											<div className="grid grid-cols-2 gap-4">
												<div>
													<label className="label-text block text-sm font-medium mb-2">
														First Name
													</label>
													<input
														type="text"
														value={formData.firstName}
														onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
														className="input-field w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dc2d27] focus:border-transparent"
														placeholder="First"
													/>
												</div>

												<div>
													<label className="label-text block text-sm font-medium mb-2">
														Last Name
													</label>
													<input
														type="text"
														value={formData.lastName}
														onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
														className="input-field w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dc2d27] focus:border-transparent"
														placeholder="Name"
													/>
												</div>
											</div >

											<div>
												<label className="label-text block text-sm font-medium mb-2">
													Initial Role <InfoTooltip content={"What role should the user be granted onto the system. (Their actions are limited to the role given to them)"}></InfoTooltip>
												</label>
												<select
													value={formData.selectedRoleId}
													onChange={(e) => setFormData({ ...formData, selectedRoleId: e.target.value })}
													className="select-field w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dc2d27] focus:border-transparent"
												>
													<option value="">Select a role</option>
													{availableRoles.map(role => (
														<option key={role.ID} value={role.ID}>
															{role.Name} - {role.Description}
														</option>
													))}
												</select>
											</div>
										</div >

										<div className="flex justify-end gap-3 mt-8 pt-6">
											<button
												type="button"
												onClick={() => setShowAddForm(false)}
												className="btn-cancel px-4 py-2 border rounded-lg transition-colors"
											>
												Cancel
											</button>
											{isAddingUser ? (
												<span className="btn-primary px-4 py-2 rounded-lg transition-colors flex items-center space-x-2">
													<svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
														<circle
															className="opacity-25"
															cx="12"
															cy="12"
															r="10"
															stroke="currentColor"
															strokeWidth="4"
															fill="none"
														/>
														<path
															className="opacity-75"
															fill="currentColor"
															d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
														/>
													</svg>
													<span>Saving...</span>
												</span>
											) : (
												<button
													type="submit"
													disabled={isAddingUser}
													className="btn-primary px-4 py-2 rounded-lg transition-colors"
												>
													Add User
												</button>
											)}
										</div>
									</form >
								</div >
							</div >
						)}

						{/* Users Table */}
						<div className="card-bg border border-divider rounded-lg shadow-sm overflow-hidden">
							<div className="overflow-x-auto">
								<table className="table-base min-w-full divide-y">
									<thead className="table-header">
										<tr>
											<th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">User</th>
											<th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">RBAC Roles</th>
											<th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Status</th>
											<th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Actions</th>
										</tr>
									</thead>
									<tbody className="table-body-divided">
										{fetchingUsers ? (
											<tr>
												<td colSpan="4" className="px-6 py-12 text-center">
													<div className="flex flex-col items-center justify-center py-8">
														<div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-500 mb-3"></div>
														<p className="text-muted text-base">Loading users...</p>
													</div>
												</td>
											</tr>
										) : filteredUsers.length === 0 ? (
											<tr>
												<td colSpan="4" className="px-6 py-12 text-center">
													<UserIcon className="w-12 h-12 text-muted mx-auto mb-4" />
													<h3 className="text-lg font-medium text-primary mb-2">No users found</h3>
													<p className="text-muted">Try adjusting your search or filters, or add a new user.</p>
												</td>
											</tr>
										) : (
											filteredUsers.map(user => (
												<tr key={user.ID} className="table-row-hover">
													<td className="px-6 py-4 whitespace-nowrap">
														<div className="flex items-center">
															<div className="flex-shrink-0 h-10 w-10">
																<div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
																	<UserIcon className="h-6 w-6 text-gray-600" />
																</div>
															</div>
															<div className="ml-4">
																<div className="text-sm font-medium text-primary">
																	{user.FirstName || user.LastName
																		? `${user.FirstName || ''} ${user.LastName || ''}`.trim()
																		: user.Email
																	}
																</div>
																<div className="user-manage-email truncate">{user.Email}</div>
																{/* <div className="text-sm text-muted">{user.Email}</div> */}
															</div >
														</div >
													</td >

													<td className="px-6 py-5">
														<div className="flex flex-wrap gap-2">
															{/* NEW RBAC ROLES DISPLAY */}
															{user.RBACRoles && user.RBACRoles.length > 0 ? (
																user.RBACRoles.map(userRole => (
																	<span
																		key={userRole.ID}
																		className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
																		style={{
																			backgroundColor: `${userRole.Role.Color}20`,
																			color: userRole.Role.Color
																		}}
																	>
																		{userRole.Role.Name}
																		{userRole.ExpiresAt && (
																			<span className="ml-1 text-xs opacity-75">
																				(expires {new Date(userRole.ExpiresAt).toLocaleDateString()})
																			</span>
																		)}
																	</span>
																))
															) : (
																// italic if want
																<span className="text-sm text-muted">No RBAC roles assigned</span>
															)}
														</div>
													</td>
													<td className="px-6 py-4 whitespace-nowrap">
														<span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${user.Status === 'active'
															? 'bg-green-100 text-green-800'
															: 'bg-red-100 text-red-800'
															}`}>
															{user.Status.charAt(0).toUpperCase() + user.Status.slice(1) || 'Active'}
														</span>
													</td>

													<td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
														{user.Email !== currentUserEmail && (
															<div className="flex items-center gap-2">
																{/* EDIT USER BUTTON */}
																{can('user', 'update') && (
																	<ActionButton
																		actionType="edit"
																		onClick={() => {
																			setEditingUser(user);
																			setShowEditModal(true);
																		}}
																		title="Edit user"
																	/>
																)}
																{/* RBAC ROLE ASSIGNMENT BUTTON */}
																{can('user', 'update') && (
																	<button
																		onClick={() => {
																			setEditingUser(user);
																			setShowRBACModal(true);
																		}}
																		className="flex items-center space-x-2 text-blue-600 hover:text-blue-900"
																		title="Manage roles"
																	>
																		<ShieldCheckIcon className="w-4 h-4" />
																		<span className="text-sm font-medium">Roles</span>
																	</button>
																)}
																{/* DELETE USER BUTTON */}
																{can('user', 'delete') && (
																	<ActionButton
																		actionType="delete"
																		onClick={() =>
																			handleDeleteUser(
																				user.ID,
																				user.Email
																			)
																		}
																		title="Delete user"
																		loadingText='Deleting...'
																		isLoading={deleteLoading[user.ID]}
																	/>
																	/*<button 
																		onClick={() => handleDeleteUser(user.ID, user.Email)}
																		className="px-2 py-1 bg-red-600 text-white rounded"
																	>
																		Delete
																	</button>
																	*/
																)}
															</div>
														)}
													</td>
												</tr>
											))
										)}
									</tbody>
								</table>
							</div>
						</div>



						{/* NEW RBAC ROLE ASSIGNMENT MODAL */}
						< RoleAssignmentModal
							user={editingUser}
							isOpen={showRBACModal}
							onClose={() => setShowRBACModal(false)}
							onSave={handleRBACRoleAssignment}
							roles={availableRoles}
						/>

						{/* USER EDIT MODAL */}
						< UserEditModal
							user={editingUser}
							isOpen={showEditModal}
							onClose={() => setShowEditModal(false)}
							onSave={handleUserEdit}
						/>
					</div >
				</div >
			</div >
		</ConditionalRequireAuth >
	);
};

export default WhitelistManagement;