'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import UnitTypeListing from './listing';
import Form from './form';
import UnitTypeDB from '@app/class/UnitType/UnitTypeDB';
import styles from '@styles/unit_type.module.css';
import RequireAuth from '@app/RequireAuth';
import { ConditionalRequireAuth } from '@components/helper';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import { useLightDarkMode } from '@app/context/LightDarkMode';

const UnitType = () => {
	const { can } = useRole();
	const { theme } = useLightDarkMode();
	const [showForm, setShowForm] = useState(false);
	const [formMode, setFormMode] = useState("VIEW");
	const [selectedUnitTypeId, setSelectedUnitTypeId] = useState(null);
	const [selectedUnitType, setSelectedUnitType] = useState(null);
	const [error, setError] = useState(null);
	const [unitTypes, setUnitTypes] = useState([]);
	const [pagination, setPagination] = useState({
		total: 0,
		page: 1,
		limit: 10,
		totalPages: 0
	});
	const [params, setParams] = useState({
		name: "",
		return: ["ID", "Name", "Colour"],
		order_by: [{ column: "Name", ascending: true }],
		page: 1,
		limit: 10
	});
	const [isFiltering, setIsFiltering] = useState(false);
	const formRef = useRef(null);

	const is_first_load = useRef(true);

	const [inputValues, setInputValues] = useState({
		name: ""
	});

	// Trigger to perform a search
	const [searchTrigger, setSearchTrigger] = useState(false);
	const [isInitialLoad, setIsInitialLoad] = useState(true);
	const [isLoading, setIsLoading] = useState(false);
	const [pageError, setPageError] = useState(null);

	// Fetch data on first load only
	useEffect(() => {
		if (is_first_load.current) {
			is_first_load.current = false;
			// Initial data load
			setSearchTrigger(prev => !prev);
		}
	}, []);

	// Check if user has permission to access this page
	const hasPermission = can('unit_type', 'read');

	// Open form handler
	const HandleOpenForm = (mode, unitTypeId = null, unitType = null) => {
		// Permission gating for simulated roles
		if (mode === 'ADD' && !can('unit_type', 'create')) {
			window.Swal?.fire?.({ title: 'Permission denied', text: 'You need unit_type:create', icon: 'warning' });
			return;
		}
		if (mode === 'EDIT' && !can('unit_type', 'update')) {
			window.Swal?.fire?.({ title: 'Permission denied', text: 'You need unit_type:update', icon: 'warning' });
			return;
		}

		console.log('unitType', unitType)
		setFormMode(mode);
		setSelectedUnitTypeId(unitTypeId);
		setSelectedUnitType(unitType);
		console.log('unitType', unitType)
		setShowForm(true);
	};

	// Filter Change handler
	const HandleFilterChange = (e) => {
		const { name, value } = e.target;
		setInputValues(prev => ({
			...prev,
			[name]: value.trim()
		}));
	};

	const handleKeyDown = (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleSearch();
		}
	};

	const handleSearch = () => {
		// Apply the temporary input values to the actual params
		setParams(prev => ({ ...prev, ...inputValues }));
		setIsInitialLoad(false);
		// Trigger a search by toggling the search trigger
		setSearchTrigger(prev => !prev);
	};

	// Pagination handlers (frontend-only)
	const handlePageChange = (newPage) => {
		if (!newPage || newPage === pagination.page || newPage < 1) return;
		setParams(prev => ({ ...prev, page: newPage }));
		setPagination(prev => ({ ...prev, page: newPage }));
	};

	const handleLimitChange = (newLimit) => {
		if (!newLimit || newLimit === pagination.limit) return;
		setParams(prev => ({ ...prev, limit: newLimit, page: 1 }));
		setPagination(prev => ({ ...prev, limit: newLimit, page: 1, totalPages: prev.total > 0 ? Math.ceil(prev.total / newLimit) : 0 }));
	};

	const fetchUnitTypes = async () => {
		try {
			setIsLoading(true);
			setPageError(null);
			const result = await UnitTypeDB.FetchUnitTypes(params);

			// Handle the response object properly (same as Term implementation)
			const arr = Array.isArray(result) ? result : (Array.isArray(result.data) ? result.data : []);

			if (!arr.length) {
				// Only show alert if user was searching by name
				if (params.name && params.name.trim() !== '') {
					await window.Swal.fire({
						title: 'No Results',
						text: 'No unit types match your name.',
						icon: 'info',
						confirmButtonColor: '#3085d6',
					});
					// Reset filters after showing the alert
					resetFilters();
					return;
				}
				// If no search term, just show empty state without alert
				setUnitTypes([]);
				return;
			}

			setUnitTypes(arr);
		} catch (error) {
			console.error('Error fetching unit types:', error);
			setPageError('Failed to load unit types');
			setUnitTypes([]);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		// Only fetch if user has permission (authenticated and authorized)
		if (hasPermission) {
			fetchUnitTypes();
		}
	}, [searchTrigger, hasPermission]);

	// Fetch data with debounce
	useEffect(() => {
		if (is_first_load.current) {
			is_first_load.current = false;
			return;
		}

		const timer = setTimeout(() => {
			setIsFiltering(false);
		}, 500);

		return () => clearTimeout(timer);
	}, [params]);

	// Refresh function
	const refreshList = useCallback(() => {
		setSearchTrigger(prev => !prev);
	}, []);

	// Reset filters
	const resetFilters = () => {
		setParams({
			name: "",
			return: ["ID", "Name", "Colour"],
			order_by: [{ column: "Name", ascending: true }],
			page: 1,
			limit: 10
		});
		setInputValues({
			name: ""
		});
		setIsInitialLoad(false);
		setSearchTrigger(prev => !prev);
	};

	// Add click outside handler
	useEffect(() => {
		const handleClickOutside = (event) => {
			// Check if click is on the confirmation dialog
			const confirmDialog = document.querySelector('.swal2-container');
			if (confirmDialog && confirmDialog.contains(event.target)) {
				return;
			}

			if (formRef.current && !formRef.current.contains(event.target)) {
				setShowForm(false);
			}
		};

		if (showForm) {
			document.addEventListener('mousedown', handleClickOutside);
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [showForm]);

	return (
		<ConditionalRequireAuth>
			{/* If user doesn't have permission, show access denied */}
			{!hasPermission ? (
				<AccessDenied requiredPermission="unit_type:read" resourceName="unit type management" />
			) : (
				<PageLoadingWrapper
					requiredPermission={{ resource: 'unit_type', action: 'read' }}
					resourceName="unit type management"
					isLoading={isLoading}
					loadingText="Loading unit types..."
					error={pageError}
					errorMessage="Failed to load unit types"
				>
					{/* THEME SWITCH: this wrapper applies page-wide colors based on current theme */}
					<div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}>
						{showForm && (
							<div className={`theBoxOfInformationBackground`}>
								<Form
									onClose={() => setShowForm(false)}
									mode={formMode}
									unitTypeId={selectedUnitTypeId}
									unitType={selectedUnitType}
									RefreshList={refreshList}
									HandleOpenForm={HandleOpenForm}
								/>
							</div>
						)}

						<div className={`unit-wrapper p-2 sm:p-3 md:p-4 w-full ${styles.unitTypeWrapper}`}>
							<h1 className={`title-text text-2xl sm:text-3xl md:text-4xl`}>
								Unit Type Management
							</h1>

							{/* SEARCH INTERFACE */}
							<div className='flex space-x-4 mb-6 lg:flex-row flex-col md:text-md text-sm'>
								<div className='flex-1 w-full'>
									<input
										type="text"
										name="name"
										placeholder="Search by Unit Type Name"
										className={`w-full p-3 rounded-md ${theme === 'dark' ? 'bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'} border`}
										value={inputValues.name}
										onChange={HandleFilterChange}
										onKeyDown={handleKeyDown}
									/>
								</div>
								<div className='flex sm:flex-row flex-col gap-2 lg:mt-0 mt-4'>
									<div className='flex flex-row sm:w-auto w-full gap-2'>
										<button
											onClick={resetFilters}
										className={`px-4 py-3 rounded-md flex justify-center items-center cursor-pointer sm:flex-none flex-1 ${theme === 'dark' ? 'bg-gray-700 text-gray-100 hover:bg-gray-600' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
										>
											Reset Filters
										</button>
										<button
											onClick={handleSearch}
											disabled={!inputValues.name || inputValues.name.trim() === ''}
											className={`px-4 py-3 rounded-md flex justify-center items-center cursor-pointer sm:flex-none flex-1 ${!inputValues.name || inputValues.name.trim() === ''
												? "bg-gray-400 text-white cursor-not-allowed"
												: "bg-[#DC2D27] text-white hover:bg-red-700"
												}`}
										>
											Search
										</button>
									</div>
									<div className='flex flex-row gap-2 sm:w-auto w-full'>
										{can('unit_type', 'create') && (
											<button
												onClick={() => HandleOpenForm("ADD")}
												disabled={!can('unit_type', 'create')}
												className={`px-4 py-3 rounded-md flex justify-center items-center sm:flex-none flex-1 ${can('unit_type', 'create')
													? 'bg-[#DC2D27] text-white cursor-pointer hover:bg-red-700'
													: 'bg-gray-300 text-white cursor-not-allowed'
													}`}
											>
												Add Unit Type
												<span className="ml-1 text-xl">+</span>
											</button>
										)}
									</div>
								</div>
							</div>

							{/* TABLE FOR UNIT TYPES */}
							<div className={`${styles.unitTypeListingContainer} mt-5 shadow-md sm:rounded-lg`}>
								<table className="table-base">
									<thead>
										<tr className="table-header-row">
											<th scope="col" className="unit-type-table-header-cell-number">No</th>
											<th scope="col" className="unit-type-table-header-cell">Name</th>
											<th scope="col" className="unit-type-table-header-cell">Color</th>
											<th scope="col" className="unit-type-table-header-cell">Actions</th>
										</tr>
									</thead>
									<tbody className="table-body-divided">
										<UnitTypeListing
											params={params}
											error={error}
											HandleOpenForm={HandleOpenForm}
											refreshList={refreshList}
											unitTypes={unitTypes}
											setPagination={setPagination}
										/>
									</tbody>
								</table>
							</div>

							{/* Pagination Controls */}
							{pagination.total > 0 && (
								<div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
									{/* Items per page selector */}
									<div className="flex items-center gap-2">
										<label className={`pagination-text`}>
											Items per page:
										</label>
										<select
											value={params.limit}
											onChange={(e) => handleLimitChange(parseInt(e.target.value))}
											className={`rounded px-2 py-1 text-sm ${theme === 'dark' ? 'border-gray-600 bg-gray-800 text-gray-100' : 'border-gray-300 bg-white text-gray-900'} border`}
										>
											<option value={10}>10</option>
											<option value={20}>20</option>
										</select>
									</div>

									{/* Page info */}
									<div className={`pagination-information`}>
										Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
									</div>

									{/* Page navigation */}
									<div className="flex items-center gap-2">
										<button
											onClick={() => handlePageChange(pagination.page - 1)}
											disabled={pagination.page <= 1}
											className={`pagination-btn`}
										>
											Previous
										</button>
										<div className="flex items-center gap-1">
											{Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
												let pageNum;
												if (pagination.totalPages <= 5) {
													pageNum = i + 1;
												} else if (pagination.page <= 3) {
													pageNum = i + 1;
												} else if (pagination.page >= pagination.totalPages - 2) {
													pageNum = pagination.totalPages - 4 + i;
												} else {
													pageNum = pagination.page - 2 + i;
												}
												return (
													<button
														key={pageNum}
														onClick={() => handlePageChange(pageNum)}
														className={pagination.page === pageNum ? 'pagination-btn-active' : 'pagination-btn'}
													>
														{pageNum}
													</button>
												);
											})}
										</div>
										<button
											onClick={() => handlePageChange(pagination.page + 1)}
											disabled={pagination.page >= pagination.totalPages}
											className={`pagination-btn`}
										>
											Next
										</button>
									</div>
								</div>
							)}
						</div>
					</div>
				</PageLoadingWrapper>
			)}
		</ConditionalRequireAuth>
	);
};

export default UnitType;