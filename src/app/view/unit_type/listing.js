import { useState, useEffect } from 'react';
import UnitTypeDB from '@app/class/UnitType/UnitTypeDB';
import { useRole } from '@app/context/RoleContext';
import ActionButton from '@components/ActionButton';

// Function to check if a unit type is restricted (cannot be edited or deleted)
const isRestrictedUnitType = (unitTypeName) => {
	const restrictedTypes = ['core', 'major', 'elective', 'mpu']; //if the unit type names are listed here, there are restricted, means cant be deleted, they are protected by the system
	return restrictedTypes.includes(unitTypeName.toLowerCase());
};

const UnitTypeListing = ({ params, error, HandleOpenForm, refreshList, unitTypes, setPagination }) => {
	const { can } = useRole();
	const [unitTypeListing, setUnitTypeListing] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isProcessing, setIsProcessing] = useState(false);
	const [processingId, setProcessingId] = useState(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);
	const [hasShownAlert, setHasShownAlert] = useState(false);
	// Fetch unit types
	useEffect(() => {
		const arr = Array.isArray(unitTypes) ? unitTypes : (Array.isArray(unitTypes?.data) ? unitTypes.data : []);
		setUnitTypeListing(arr);
		setIsLoading(false);
		// Only set isInitialLoad to false if this is a search and no data was returned
		if (params.name && (!arr || arr.length === 0)) {
			setIsInitialLoad(false);
		}
		// Update pagination state in parent component (frontend-only)
		if (typeof setPagination === 'function') {
			const total = (arr || []).length;
			const limit = params.limit || 10;
			const page = params.page || 1;
			const totalPages = Math.ceil(total / limit);
			setPagination({ total, page, limit, totalPages });
		}
	}, [unitTypes, params.limit, params.page, params.name, setPagination]);

	const handleDelete = async (unitTypeId, unitTypeName) => {
		// Check permission first
		if (!can('unit_type', 'delete')) {
			await window.Swal?.fire?.({ title: 'Permission denied', text: 'You need unit_type:delete', icon: 'warning' });
			return;
		}

		// Check if unit type is restricted
		if (isRestrictedUnitType(unitTypeName)) {
			await window.Swal.fire({
				title: 'Cannot Delete',
				text: `"${unitTypeName}" is a system unit type and cannot be deleted.`,
				icon: 'warning',
				confirmButtonText: 'OK'
			});
			return;
		}

		const result = await window.Swal.fire({
			title: 'Delete Unit Type',
			text: 'Are you sure you want to delete this unit type? This action cannot be undone.',
			icon: 'warning',
			showCancelButton: true,
			confirmButtonColor: '#d33',
			cancelButtonColor: '#3085d6',
			confirmButtonText: 'Yes, delete it!',
			cancelButtonText: 'No, cancel'
		});

		if (!result.isConfirmed) return;

		setProcessingId(unitTypeId);
		try {
			const res = await UnitTypeDB.deleteUnitType(unitTypeId);
			if (res.success) {
				await window.Swal.fire({
					title: 'Deleted!',
					text: 'Unit type has been deleted successfully.',
					icon: 'success',
					confirmButtonText: 'OK'
				});
				refreshList();
			} else {
				await window.Swal.fire({
					title: 'Error',
					text: res.message || 'Failed to delete unit type',
					icon: 'error',
					confirmButtonText: 'OK'
				});
			}
		} catch (err) {
			console.error('Delete error:', err);
			await window.Swal.fire({
				title: 'Error',
				text: err.message || 'An error occurred while deleting the unit type',
				icon: 'error',
				confirmButtonText: 'OK'
			});
		} finally {
			setProcessingId(null);
		}
	};


	const sortedUnitTypeListing = unitTypeListing.sort((a, b) => {
		const aIsRestricted = isRestrictedUnitType(a.name);
		const bIsRestricted = isRestrictedUnitType(b.name);

		// If 'a' is restricted and 'b' is not, 'a' comes first (return -1)
		if (aIsRestricted && !bIsRestricted) {
			return -1;
		}
		// If 'b' is restricted and 'a' is not, 'b' comes first (return 1)
		if (!aIsRestricted && bIsRestricted) {
			return 1;
		}
		// If both are restricted or both are not restricted, maintain existing order (return 0)
		return 0;
	});

	return (
		<>
			{isLoading ? (
				<tr>
					<td colSpan="4" className="text-center py-4">
						<div className="flex justify-center items-center">
							<svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
								<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Loading unit types...
						</div>
					</td>
				</tr>
			) : sortedUnitTypeListing.length === 0 ? (
				<tr>
					<td colSpan="4" className="py-8 text-gray-500" style={{ height: "120px" }}>
						<div className="flex items-center justify-center w-full h-full">
							{isInitialLoad ? 'No Unit Types Found' : 'No unit types match your filters'}
						</div>
					</td>
				</tr>
			) : (Array.isArray(sortedUnitTypeListing) ? (
				sortedUnitTypeListing
					.slice(
						((params.page || 1) - 1) * (params.limit || 10),
						(params.page || 1) * (params.limit || 10)
					)
					.map((unitType, index) => {
						const isRestricted = isRestrictedUnitType(unitType.name);
						return (
							<tr
								key={`${unitType.id}-${index}`}
								className="table-row-hover group cursor-pointer"
								onClick={() => HandleOpenForm('VIEW', unitType.id, unitType)}
							>
								<td className="unit-type-table-cell-number">
									{(((params.page || 1) - 1) * (params.limit || 10)) + index + 1}
								</td>
								<td className="unit-type-table-cell-name">
									{unitType.name}
									{isRestricted && (
										<span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">System</span>
									)}
								</td>
								<td className="unit-type-table-cell-color">
									<div className="flex items-center gap-2">
										<div className="w-8 h-8 rounded-full border border-gray-400" style={{ backgroundColor: unitType.colour }}></div>
										<span className="font-mono">{unitType.colour}</span>
									</div>
								</td>
								<td className="unit-type-table-cell-actions">
									<div className="flex space-x-2">
										{can('unit_type', 'read') && (
											<button
												onClick={(e) => {
													e.stopPropagation();
													HandleOpenForm('VIEW', unitType.id, unitType);
												}}
												className="text-blue-600 hover:text-blue-900 cursor-pointer"
												title="View unit type"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													className="w-6 h-6"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
													/>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
													/>
												</svg>
											</button>
										)}

										{can('unit_type', 'update') && (
											<button
												onClick={(e) => {
													e.stopPropagation();
													HandleOpenForm('EDIT', unitType.id, unitType);
												}}
												className={`text-indigo-600 hover:text-indigo-900 cursor-pointer`}
												title={'Edit unit type'}
											>
												<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
													/>
												</svg>
											</button>
										)}

										{can('unit_type', 'delete') && !isRestricted && (
											<ActionButton
												actionType="delete"
												onClick={(e) => {
													e.stopPropagation();
													handleDelete(unitType.id, unitType.name);
												}}
												isLoading={processingId === unitType.id}
												loadingText="Deleting..."
												title="Delete unit type"
											/>
										)}
									</div>
								</td>
							</tr>
						);
					})
			) : null)}
		</>
	);
};

export default UnitTypeListing;