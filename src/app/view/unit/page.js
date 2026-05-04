'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import UnitListing from './listing';
import Form from './form';
import UnitFileUploader from './UnitFileUploader';
import styles from '@styles/unit.module.css';
import { useRouter } from 'next/navigation';
import { ConditionalRequireAuth } from '@components/helper';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import { useLightDarkMode } from '@app/context/LightDarkMode';
import InfoTooltip from '@components/InfoTooltip';

const Unit = () => {
	const { can } = useRole();
	const { theme } = useLightDarkMode();
	const [showForm, setShowForm] = useState(false);
	const [showFileUploader, setShowFileUploader] = useState(false);
	const [formMode, setFormMode] = useState("READ");
	const [selectedUnit, setSelectedUnit] = useState(null);

	const [showFilterModal, setShowFilterModal] = useState(false);

	const [params, setParams] = useState({
		code: "",
		name: "",
		availability: "all",
		return: ["UnitCode", "Name", "Availability"],
		order_by: [{ column: "UnitCode", ascending: true }],
		page: 1,
		limit: 10,
		exact: false
	});

	const [inputValues, setInputValues] = useState({
		code: "",
		name: "",
		availability: "all"
	});

	const [pagination, setPagination] = useState({
		total: 0,
		page: 1,
		limit: 10,
		totalPages: 0
	});

	const [searchTrigger, setSearchTrigger] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [pageError, setPageError] = useState(null);

	const is_first_load = useRef(true);

	const hasPermission = can('unit', 'read');

	useEffect(() => {
		setInputValues({
			code: params.code,
			name: params.name,
			availability: params.availability
		});
	}, []);

	useEffect(() => {
		if (is_first_load.current) {
			is_first_load.current = false;
			setSearchTrigger(prev => !prev);
			// Delay to ensure loading screen shows
			setTimeout(() => {
				setIsLoading(false);
			}, 500);
		}
	}, []);

	const HandleOpenForm = (mode, unit = null) => {
		if (mode === 'ADD' && !can('unit', 'create')) {
			window.Swal?.fire?.({ title: 'Permission denied', text: 'You need unit:create', icon: 'warning' });
			return;
		}
		if (mode === 'EDIT' && !can('unit', 'update')) {
			window.Swal?.fire?.({ title: 'Permission denied', text: 'You need unit:update', icon: 'warning' });
			return;
		}
		setFormMode(mode);
		setSelectedUnit(unit);
		setShowForm(true);
	};

	const handleOpenFileUploader = () => setShowFileUploader(true);
	const handleCloseFileUploader = () => setShowFileUploader(false);

	const handleUnitCodeSearch = (e) => {
		const { value } = e.target;
		setInputValues(prev => ({ ...prev, code: value }));
	};

	const handleKeyDown = (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleSearch();
		}
	};

	const HandleFilterChange = (e) => {
		const { name, value } = e.target;
		setInputValues(prev => ({ ...prev, [name]: value }));
	};

	const applyFilters = () => {
		setShowFilterModal(false);
		setParams(prev => ({ ...prev, ...inputValues }));
		setSearchTrigger(prev => !prev);
	};

	const resetFilters = () => {
		setParams({
			code: "",
			name: "",
			availability: "all",
			return: ["UnitCode", "Name", "Availability"],
			order_by: [{ column: "UnitCode", ascending: true }],
			page: 1,
			limit: 10,
			exact: false
		});
		setInputValues({
			code: "",
			name: "",
			availability: "all"
		});
		setSearchTrigger(prev => !prev);
	};

	const handleSearch = () => {
		if (!inputValues.code || inputValues.code.trim() === '') {
			return;
		}
		setParams(prev => ({ ...prev, ...inputValues }));
		setSearchTrigger(prev => !prev);
	};

	const refreshList = useCallback(() => {
		setParams(prev => ({ ...prev, page: 1 }));
		setPagination(prev => ({ ...prev, page: 1 }));
		setSearchTrigger(prev => !prev);
	}, []);

	const handlePageChange = (newPage) => {
		if (!newPage || newPage === pagination.page) return;
		setParams(prev => ({ ...prev, page: newPage }));
		setPagination(prev => ({ ...prev, page: newPage }));
		setSearchTrigger(prev => !prev);
	};

	const handleLimitChange = (newLimit) => {
		if (!newLimit || newLimit === pagination.limit) return;
		setParams(prev => ({ ...prev, limit: newLimit, page: 1 }));
		setPagination(prev => ({ ...prev, limit: newLimit, page: 1, totalPages: pagination.total > 0 ? Math.ceil(pagination.total / newLimit) : 0 }));
		setSearchTrigger(prev => !prev);
	};

	return (
		<ConditionalRequireAuth>
			<PageLoadingWrapper
				requiredPermission={{ resource: 'unit', action: 'read' }}
				resourceName="unit management"
				isLoading={isLoading}
				loadingText="Loading units..."
				error={pageError}
				errorMessage="Failed to load units"
				showPermissionLoading={false}
			>
				{/* THEME SWITCH: this wrapper applies page-wide colors based on current theme */}
				<div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}>
					{/* Unit Form Modal */}
					{showForm && (
						<div className={`theBoxOfInformationBackground`}>
							<Form
								onClose={() => setShowForm(false)}
								mode={formMode}
								unit={selectedUnit}
								RefreshList={refreshList}
								HandleOpenForm={HandleOpenForm}
							/>
						</div>
					)}

					{/* File Uploader Modal */}
					{showFileUploader && (
						<div
							className="fixed inset-0 flex items-center justify-center z-50"
							style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
							onClick={handleCloseFileUploader}
						>
							<div onClick={(e) => e.stopPropagation()}>
								<UnitFileUploader
									onClose={handleCloseFileUploader}
									onUploadSuccess={refreshList}
								/>
							</div>
						</div>
					)}

					{/* Advanced Filter Modal */}
					{showFilterModal && (
						<div
							className={`fileUploaderModal`}
							onClick={() => setShowFilterModal(false)}
						>
							<div
								className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} p-6 rounded-lg shadow-xl w-[500px]`}
								onClick={(e) => e.stopPropagation()}
							>
								<div className="flex justify-between items-center mb-4">
									<h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>Advanced Filters</h2>
									<button
										onClick={() => setShowFilterModal(false)}
										className={`${theme === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
									>
										<svg width="24" height="24" stroke="currentColor" strokeWidth="2">
											<line x1="18" y1="6" x2="6" y2="18" />
											<line x1="6" y1="6" x2="18" y2="18" />
										</svg>
									</button>
								</div>
								<div className="space-y-4">
									<div>
										<label htmlFor="filter_code" className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
											Unit Code
										</label>
										<input
											type="text"
											name="code"
											id="filter_code"
											className={`w-full p-2 rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'} border`}
											value={inputValues.code}
											onChange={HandleFilterChange}
										/>
									</div>
									<div>
										<label htmlFor="filter_name" className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
											Unit Name
										</label>
										<input
											type="text"
											name="name"
											id="filter_name"
											className={`w-full p-2 rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'} border`}
											value={inputValues.name}
											onChange={HandleFilterChange}
										/>
									</div>
									<div>
										<label htmlFor="availability" className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
											Availability
										</label>
										<select
											name="availability"
											id="availability"
											className={`w-full p-2 rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'} border`}
											value={inputValues.availability}
											onChange={HandleFilterChange}
										>
											<option value="all">All</option>
											<option value="published">Published</option>
											<option value="unavailable">Unavailable</option>
											<option value="unpublished">Unpublished</option>
										</select>
									</div>
									<div className="flex justify-end space-x-2 pt-4">
										<button
											onClick={() => setShowFilterModal(false)}
											className={`px-4 py-2 rounded ${theme === 'dark' ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-100'} border`}
										>
											Cancel
										</button>
										<button
											onClick={applyFilters}
											className="px-4 py-2 bg-[#DC2D27] text-white rounded hover:bg-red-700"
										>
											Apply Filters
										</button>
									</div>
								</div>
							</div>
						</div>
					)}

					<div className={`unit-wrapper p-3 w-full ${styles.unitWrapper}`}>
						<h1 className={`title-text`}>
							Unit Management
							<InfoTooltip
								content={"In this page, it is where all the units that are currrently in the database will be shown. All units have their UnitCode, Name, Availability, Semester Offered and their Requisites."}
								position='right'
								className='info-bttn'
							></InfoTooltip>
						</h1>
						{/* SEARCH INTERFACE */}
						<div className='flex space-x-4 mb-6 lg:flex-row flex-col md:text-md text-sm'>
							<div className='flex-1 w-full'>
								<input
									type="text"
									name="unitCode"
									placeholder="Search by Unit Code"
									className={`search-bar`}
									value={inputValues.code}
									onChange={handleUnitCodeSearch}
									onKeyDown={handleKeyDown}
								/>
							</div>
							<div className='flex sm:flex-row flex-col gap-2 lg:mt-0 mt-4'>
								<div className='flex flex-row sm:w-auto w-full gap-2'>
									<button
										onClick={() => setShowFilterModal(true)}
										className={`px-4 py-3 rounded-md flex justify-center items-center cursor-pointer sm:flex-none flex-1 ${theme === 'dark' ? 'bg-gray-700 text-gray-100 hover:bg-gray-600' : 'bg-white text-gray-700 hover:bg-gray-50 border'}`}
									>
										Filter
										<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
										</svg>
									</button>
									<button
										onClick={resetFilters}
										className={`px-4 py-3 rounded-md flex justify-center items-center cursor-pointer sm:flex-none flex-1 ${theme === 'dark' ? 'bg-gray-700 text-gray-100 hover:bg-gray-600' : 'bg-white text-gray-700 hover:bg-gray-50 border'}`}
									>
										Reset Filters
									</button>
									<button
										onClick={handleSearch}
										disabled={!inputValues.code || inputValues.code.trim() === ''}
										className={`px-4 py-3 rounded-md flex justify-center items-center cursor-pointer sm:flex-none flex-1 ${!inputValues.code || inputValues.code.trim() === ''
											? "bg-gray-400 text-white cursor-not-allowed"
											: "bg-[#DC2D27] text-white hover:bg-red-700"
											}`}
									>
										Search
									</button>
								</div>
								<div className='flex flex-row gap-2 sm:w-auto w-full'>
									{can('unit', 'create') && (
										<>
											<button
												onClick={() => HandleOpenForm("ADD")}
												disabled={!can('unit', 'create')}
												className={`px-4 py-3 rounded-md flex justify-center items-center sm:flex-none flex-1 ${can('unit', 'create')
													? 'bg-[#DC2D27] text-white cursor-pointer hover:bg-red-700'
													: 'bg-gray-300 text-white cursor-not-allowed'
													}`}
											>
												Add Unit
												<span className="ml-1 text-xl">+</span>
											</button>
											<button
												className={`px-4 py-3 rounded-md flex justify-center items-center sm:flex-none flex-1 border-2 ${can('unit', 'create')
													? theme === 'dark'
														? 'bg-[#DC2D27] text-white cursor-pointer hover:bg-red-700 border-[#DC2D27]'
														: 'bg-white text-[#DC2D27] cursor-pointer hover:bg-gray-50 border-red-600'
													: 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-100'
													}`}
												onClick={handleOpenFileUploader}
												disabled={!can('unit', 'create')}
											>
												Import Unit
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-6 ml-2">
													<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
												</svg>
											</button>
										</>
									)}

								</div>
							</div>
						</div>

						{/* TABLE FOR UNIT */}
						<div className={`${styles.unitListingContainer} mt-5 shadow-md sm:rounded-lg`}>
							<table className="table-base">
								<thead>
									<tr className="table-header-row">
										<th className="unit-table-cell-no">No</th>
										<th className="unit-table-cell-code">Unit Code</th>
										<th className="unit-table-cell-name">Name</th>
										<th className="unit-table-cell-offered">Offered In</th>
										<th className="unit-table-cell-availability">Availability</th>
										<th className="unit-table-cell-requisites">Requisites</th>
										<th className="unit-table-cell-actions">Action</th>
									</tr>
								</thead>
								<tbody className="table-body-divided">
									<UnitListing
										params={params}
										searchTrigger={searchTrigger}
										HandleOpenForm={HandleOpenForm}
										resetFilter={resetFilters}
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
		</ConditionalRequireAuth>
	);
}

export default Unit;