'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Swal from 'sweetalert2';
import UnitTypeListing from './listing';
import Form from './form';
import UnitTypeDB from '@app/class/UnitType/UnitTypeDB';
import styles from '@styles/unit_type.module.css';
import { ConditionalRequireAuth } from '@components/helper';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import { useLightDarkMode } from '@app/context/LightDarkMode';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

const UnitType = () => {
	const { can } = useRole();
	const { theme } = useLightDarkMode();
	const [showForm, setShowForm] = useState(false);
	const [formMode, setFormMode] = useState("VIEW");
	const [selectedUnitTypeId, setSelectedUnitTypeId] = useState(null);
	const [selectedUnitType, setSelectedUnitType] = useState(null);
	const [error, setError] = useState(null);
	const [unitTypes, setUnitTypes] = useState([]);
	const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
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

	// ---------- New state for color mapping modal ----------
	const [showColorModal, setShowColorModal] = useState(false);
	const [colorModalLoading, setColorModalLoading] = useState(false);
	const [pdfFileForColors, setPdfFileForColors] = useState(null);
	const [extractedColors, setExtractedColors] = useState([]);
	const [unitTypeList, setUnitTypeList] = useState([]);
	const [colorModalError, setColorModalError] = useState(null);
	// --------------------------------------------------------

	// Fetch data on first load only
	useEffect(() => {
		if (is_first_load.current) {
			is_first_load.current = false;
			setSearchTrigger(prev => !prev);
		}
	}, []);

	// Check if user has permission to access this page
	const hasPermission = can('unit_type', 'read');

	// Open form handler
	const HandleOpenForm = (mode, unitTypeId = null, unitType = null) => {
		if (mode === 'ADD' && !can('unit_type', 'create')) {
			Swal.fire({ title: 'Permission denied', text: 'You need unit_type:create', icon: 'warning' });
			return;
		}
		if (mode === 'EDIT' && !can('unit_type', 'update')) {
			Swal.fire({ title: 'Permission denied', text: 'You need unit_type:update', icon: 'warning' });
			return;
		}
		setFormMode(mode);
		setSelectedUnitTypeId(unitTypeId);
		setSelectedUnitType(unitType);
		setShowForm(true);
	};

	// Filter handlers
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
		setParams(prev => ({ ...prev, ...inputValues }));
		setIsInitialLoad(false);
		setSearchTrigger(prev => !prev);
	};

	// Pagination handlers
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
			const arr = Array.isArray(result) ? result : (Array.isArray(result.data) ? result.data : []);
			if (!arr.length) {
				if (params.name && params.name.trim() !== '') {
					await Swal.fire({
						title: 'No Results',
						text: 'No unit types match your name.',
						icon: 'info',
						confirmButtonColor: '#3085d6',
					});
					resetFilters();
					return;
				}
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
		if (hasPermission) {
			fetchUnitTypes();
		}
	}, [searchTrigger, hasPermission]);

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

	const refreshList = useCallback(() => {
		setSearchTrigger(prev => !prev);
	}, []);

	const resetFilters = () => {
		setParams({
			name: "",
			return: ["ID", "Name", "Colour"],
			order_by: [{ column: "Name", ascending: true }],
			page: 1,
			limit: 10
		});
		setInputValues({ name: "" });
		setIsInitialLoad(false);
		setSearchTrigger(prev => !prev);
	};

	// ---------- Color mapping modal functions ----------
	const loadUnitTypesForModal = async () => {
		try {
			const res = await SecureFrontendAuthHelper.authenticatedFetch('/api/unit_type?limit=100');
			const json = await res.json();
			const types = json.data || [];
			setUnitTypeList(types);
		} catch (err) {
			console.error('Failed to load unit types', err);
		}
	};

	const handleColorFileChange = async (e) => {
		const file = e.target.files?.[0];
		if (!file) return;
		if (file.type !== 'application/pdf') {
			setColorModalError('Please upload a PDF file.');
			return;
		}
		setPdfFileForColors(file);
		setColorModalError(null);
		setExtractedColors([]);
		setColorModalLoading(true);

		try {
			const formData = new FormData();
			formData.append('file', file);
			const response = await fetch('/api/pdf-debug', { method: 'POST', body: formData });
			if (!response.ok) throw new Error('Failed to extract colors');
			const blocks = await response.json();

			const colorMap = new Map();
			for (const block of blocks) {
				const color = block.color.toLowerCase();
				if (!colorMap.has(color) && block.text.trim()) {
					colorMap.set(color, { sampleText: block.text.trim() });
				}
			}
			const uniqueColors = Array.from(colorMap.entries()).map(([color, data]) => ({
				color,
				sampleText: data.sampleText,
				selectedTypeId: null
			}));
			setExtractedColors(uniqueColors);
		} catch (err) {
			setColorModalError(err.message);
		} finally {
			setColorModalLoading(false);
		}
	};

	const saveColorMappings = async () => {
		const mappings = extractedColors.filter(c => c.selectedTypeId !== null);
		if (mappings.length === 0) {
			setColorModalError('Please select at least one unit type for a color.');
			return;
		}
		setColorModalLoading(true);
		try {
			const payload = mappings.map(m => ({ color: m.color, unitTypeId: m.selectedTypeId }));
			const res = await SecureFrontendAuthHelper.authenticatedFetch('/api/unit-type-color', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mappings: payload })
			});
			const json = await res.json();
			if (json.success) {
				await Swal.fire({ title: 'Success', text: 'Color mappings saved!', icon: 'success' });
				setShowColorModal(false);
				setPdfFileForColors(null);
				setExtractedColors([]);
				refreshList();
			} else {
				throw new Error(json.message);
			}
		} catch (err) {
			setColorModalError(err.message);
		} finally {
			setColorModalLoading(false);
		}
	};
	// ----------------------------------------------------

	// Click outside handler for forms
	useEffect(() => {
		const handleClickOutside = (event) => {
			const confirmDialog = document.querySelector('.swal2-container');
			if (confirmDialog && confirmDialog.contains(event.target)) return;
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
					<div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}>
						{showForm && (
							<div className="theBoxOfInformationBackground">
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
							<h1 className="title-text text-2xl sm:text-3xl md:text-4xl">
								Unit Type Management
							</h1>

							{/* SEARCH INTERFACE */}
							<div className="flex space-x-4 mb-6 lg:flex-row flex-col md:text-md text-sm">
								<div className="flex-1 w-full">
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
								<div className="flex sm:flex-row flex-col gap-2 lg:mt-0 mt-4">
									<div className="flex flex-row sm:w-auto w-full gap-2">
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
									<div className="flex flex-row gap-2 sm:w-auto w-full">
										{can('unit_type', 'create') && (
											<button
												onClick={() => HandleOpenForm("ADD")}
												className="bg-[#DC2D27] text-white px-4 py-3 rounded-md flex items-center cursor-pointer hover:bg-red-700"
											>
												Add Unit Type <span className="ml-1 text-xl">+</span>
											</button>
										)}
										{/* NEW BUTTON: Upload Study Planner Design */}
										<button
											onClick={() => { setShowColorModal(true); loadUnitTypesForModal(); }}
											className="bg-green-600 text-white px-4 py-3 rounded-md flex items-center cursor-pointer hover:bg-green-700"
										>
											Upload Study Planner Design
										</button>
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
									<div className="flex items-center gap-2">
										<label className="pagination-text">Items per page:</label>
										<select
											value={params.limit}
											onChange={(e) => handleLimitChange(parseInt(e.target.value))}
											className={`rounded px-2 py-1 text-sm ${theme === 'dark' ? 'border-gray-600 bg-gray-800 text-gray-100' : 'border-gray-300 bg-white text-gray-900'} border`}
										>
											<option value={10}>10</option>
											<option value={20}>20</option>
										</select>
									</div>
									<div className="pagination-information">
										Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
									</div>
									<div className="flex items-center gap-2">
										<button
											onClick={() => handlePageChange(pagination.page - 1)}
											disabled={pagination.page <= 1}
											className="pagination-btn"
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
											className="pagination-btn"
										>
											Next
										</button>
									</div>
								</div>
							)}
						</div>
					</div>

					{/* Modal for uploading study planner design to extract colors */}
					{showColorModal && (
						<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowColorModal(false)}>
							<div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
								<div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white">
									<h3 className="text-lg font-semibold">Upload Study Planner Design (Color Mapping)</h3>
									<button
										onClick={() => {
											if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
											setPdfPreviewUrl(null);
											setShowColorModal(false);
										}}
										className="text-gray-500 hover:text-gray-700"
									>
										✕
									</button>
								</div>
								<div className="p-4">
									{colorModalError && <p className="text-red-600 text-sm mb-3">{colorModalError}</p>}

									{/* File upload */}
									<label className="block mb-4">
										<span className="text-sm font-medium text-gray-700">Upload a PDF study planner</span>
										<input
											type="file"
											accept="application/pdf"
											onChange={(e) => {
												const file = e.target.files?.[0];
												if (file) {
													if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
													setPdfPreviewUrl(URL.createObjectURL(file));
												}
												handleColorFileChange(e);
											}}
											className="mt-2 block w-full border rounded p-2"
										/>
									</label>

									{pdfFileForColors && (
										<div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
											{/* Left column: extracted colors */}
											<div>
												<p className="font-medium">Extracted Colors ({extractedColors.length})</p>
												{colorModalLoading && <p className="text-gray-500">Processing...</p>}
												{!colorModalLoading && extractedColors.length === 0 && <p className="text-gray-400">No colors extracted.</p>}
												<div className="space-y-3 mt-2 max-h-96 overflow-y-auto pr-2">
													{extractedColors.map((item, idx) => (
														<div key={idx} className="flex items-center gap-3 p-2 border rounded">
															<div className="w-10 h-10 rounded border" style={{ backgroundColor: item.color }}></div>
															<div className="flex-1">
																<code className="text-xs">{item.color}</code>
																<p className="text-xs text-gray-500 truncate">{item.sampleText}</p>
															</div>
															<select
																value={item.selectedTypeId || ''}
																onChange={(e) => {
																	const newCols = [...extractedColors];
																	newCols[idx].selectedTypeId = parseInt(e.target.value);
																	setExtractedColors(newCols);
																}}
																className="border rounded px-2 py-1 text-sm"
															>
																<option value="">-- Select Unit Type --</option>
																{unitTypeList.map(type => (
																	<option key={type.ID} value={type.ID}>{type.Name}</option>
																))}
															</select>
														</div>
													))}
												</div>
												<div className="mt-4 flex justify-end gap-3">
													<button
														onClick={() => {
															if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
															setPdfPreviewUrl(null);
															setShowColorModal(false);
														}}
														className="px-4 py-2 bg-gray-200 rounded"
													>
														Cancel
													</button>
													<button onClick={saveColorMappings} disabled={colorModalLoading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
														Save Mappings
													</button>
												</div>
											</div>

											{/* Right column: PDF preview */}
											<div className="border rounded p-2 bg-gray-50">
												<p className="text-sm font-medium mb-2">PDF Preview (first page)</p>
												{pdfPreviewUrl ? (
													<iframe
														src={`${pdfPreviewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
														className="w-full h-96 border rounded"
														title="PDF preview"
													/>
												) : (
													<div className="w-full h-96 flex items-center justify-center text-gray-400 border rounded bg-gray-100">
														Upload a PDF to see preview
													</div>
												)}
											</div>
										</div>
									)}
								</div>
							</div>
						</div>
					)}
				</PageLoadingWrapper>
			)}
		</ConditionalRequireAuth>
	);
};

export default UnitType;