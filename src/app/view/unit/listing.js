import { useState, useEffect } from 'react';
import UnitDB from '@app/class/Unit/UnitDB';
import UnitRequisitesDisplay from './unit_requisite_display';
import { useRole } from '@app/context/RoleContext';
import ActionButton from '@components/ActionButton';

const UnitListing = ({ params, searchTrigger, HandleOpenForm, resetFilter, setPagination }) => {
	// No need for theme variable - using global classes instead
	const { can } = useRole();
	const [unitListing, setUnitListing] = useState([]);
	const [fetchError, setFetchError] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [hasShownNoUnitsAlert, setHasShownNoUnitsAlert] = useState(false);
	const [deleteLoading, setDeleteLoading] = useState({});

	useEffect(() => {
		const FetchUnits = async () => {
			setIsLoading(true);
			try {
				const res = await UnitDB.FetchUnits(params);

				if (!res.success) {
					setFetchError(res.message || 'Failed to fetch units');
					setUnitListing([]);
					return;
				}
				setFetchError(null);
				setUnitListing(res.data || []);

				// Update pagination state in parent component
				if (setPagination) {
					const total = (res.data || []).length;
					const limit = params.limit || 10;
					const page = params.page || 1;
					const totalPages = Math.ceil(total / limit);
					setPagination({ total, page, limit, totalPages });
				}
			} catch (err) {
				setFetchError(err.message || 'Unexpected error');
				setUnitListing([]);
			} finally {
				setIsLoading(false);
			}
		};

		FetchUnits();
	}, [searchTrigger]);

	// Handle no units found case
	useEffect(() => {
		const hasSearchParams = params.code || params.name || (params.availability && params.availability !== "all");

		if (!isLoading && !fetchError && Array.isArray(unitListing) && unitListing.length === 0 && !hasShownNoUnitsAlert && hasSearchParams) {
			setHasShownNoUnitsAlert(true);
			if (resetFilter) {
				setTimeout(async () => {
					await window.Swal.fire({
						title: 'No Units Found',
						text: 'No units match your filter. Filters will be reset.',
						icon: 'info',
						confirmButtonColor: '#3085d6',
					});
					resetFilter();
				}, 0);
			}
		}
	}, [unitListing, params.code, params.name, params.availability, isLoading, fetchError, hasShownNoUnitsAlert, resetFilter]);

	const HandleDeleteUnit = async (unit_id) => {

		const result = await window.Swal.fire({
			title: 'Delete Unit',
			text: 'Are you sure you want to delete this unit? This action cannot be undone.',
			icon: 'warning',
			showCancelButton: true,
			confirmButtonColor: '#d33',
			cancelButtonColor: '#3085d6',
			confirmButtonText: 'Yes, delete it!',
			cancelButtonText: 'No, cancel'
		});

		if (!result.isConfirmed) {
			setDeleteLoading((prev) => ({ ...prev, [unit_id]: false }));
			return;
		}
		setDeleteLoading((prev) => ({ ...prev, [unit_id]: true }));

		try {
			const res = await UnitDB.DeleteUnit(unit_id);
			setDeleteLoading((prev) => ({ ...prev, [unit_id]: false }));

			if (res.success) {
				window.Swal.fire({
					title: 'Deleted!',
					text: res.message || 'Unit deleted successfully',
					icon: 'success',
					confirmButtonText: 'OK',
					confirmButtonColor: '#6c63ff'
				});
				resetFilter();
			} else {
				let errorMsg = res.message || 'Delete operation failed';
				if (res.details) {
					const d = res.details;
					errorMsg += `\n\nDependencies:\n` +
						(d.requisites ? `${d.requisites} requisite(s)\n` : '') +
						(d.termOfferings ? `${d.termOfferings} term offering(s)\n` : '') +
						(d.studyPlannerUnits ? `${d.studyPlannerUnits} study planner unit(s)\n` : '');
				}
				window.Swal.fire({
					title: 'Cannot Delete',
					text: errorMsg,
					icon: 'error',
					confirmButtonText: 'OK',
					confirmButtonColor: '#d33'
				});
			}
		} catch (error) {
			setDeleteLoading((prev) => ({ ...prev, [unit_id]: false }));
			window.Swal.fire({
				title: 'Error',
				text: `Failed to delete unit: ${error.message}`,
				icon: 'error',
				confirmButtonText: 'OK',
				confirmButtonColor: '#d33'
			});
		}
	};

	if (isLoading) {
		return (
			<tr>
				<td colSpan="7" className="text-center text-muted unit-table-cell py-8">
					<div className="flex justify-center items-center">
						<svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-muted" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
							<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
							<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						Loading units...
					</div>
				</td>
			</tr>
		);
	}

	if (fetchError) {
		return (
			<tr>
				<td colSpan="7" className="unit-table-cell text-center text-muted py-8">
					<div className="flex items-center justify-center w-full h-full">
						Error: {fetchError}
					</div>
				</td>
			</tr>
		);
	}

	// Show empty state when no units found
	if (Array.isArray(unitListing) && unitListing.length === 0 && !isLoading && !fetchError) {
		return (
			<tr>
				<td colSpan="7" className="text-center text-muted unit-table-cell py-8">
					No units found.
				</td>
			</tr>
		);
	}

	// Compute safe pagination numbers
	const currentPage = Number(params?.page) || 1;
	const currentLimit = Number(params?.limit) || 10;

	return (
		<>
			{unitListing
				.slice(
					((currentPage) - 1) * (currentLimit),
					(currentPage) * (currentLimit)
				)
				.map((unit, index) => (
					<tr
						//allows the small box to appear when view unit
						key={unit.id}
						className="table-row-hover group cursor-pointer"
						onClick={() => HandleOpenForm('VIEW', unit)}
					>
						<td className="unit-table-cell-no">
							{(((currentPage - 1) * currentLimit) + index + 1)}
						</td>
						<td className="unit-table-cell-code font-medium">{unit.unit_code}</td>
						<td className="unit-table-cell-name">{unit.name}</td>
						<td className="unit-table-cell-offered">
							{unit.offered_terms && unit.offered_terms.length > 0 ? (
								<div className="flex flex-wrap gap-1">
									{/* color for the unit offered */}
									{unit.offered_terms.map((term, i) => (
										<span key={i} className="badge-info">
											{term}
										</span>
									))}
								</div>
							) : (
								<span className="text-muted">None</span>
							)}
						</td>
						<td className="unit-table-cell-availability">
							<span className={
								unit.availability.toLowerCase() === 'published'
									? 'badge-success'
									: unit.availability.toLowerCase() === 'unpublished'
										? 'badge-warning'
										: 'badge-error'
							}>
								{unit.availability
									? unit.availability.charAt(0).toUpperCase() + unit.availability.slice(1)
									: 'Unavailable'}
							</span>
						</td>
						<td className="unit-table-cell-requisites">
							<UnitRequisitesDisplay unit={unit} />
						</td>
						<td className="unit-table-cell-actions text-center">
							<div className="flex space-x-2">
								{can('unit', 'read') && (
									<ActionButton
										actionType="view"
										onClick={(e) => {
											e.stopPropagation();
											HandleOpenForm('VIEW', unit);
										}}
										title="View unit"
									/>
								)}

								{can('unit', 'update') && (
									<ActionButton
										actionType="edit"
										onClick={(e) => {
											e.stopPropagation();
											HandleOpenForm('EDIT', unit);
										}}
										title="Edit unit"
									/>
								)}

								{can('unit', 'delete') && (
									<ActionButton
										actionType="delete"
										onClick={(e) => {
											e.stopPropagation();
											HandleDeleteUnit(unit.id);
										}}
										isLoading={deleteLoading[unit.id]}
										loadingText="Deleting..."
										title="Delete unit"
									/>
								)}
							</div>
						</td>
					</tr>
				))}
		</>
	);
};

export default UnitListing;