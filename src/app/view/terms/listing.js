import { useState, useEffect } from "react";
import TermDB from "@app/class/Term/termDB";
import { useRole } from '@app/context/RoleContext';
const TermListing = ({ params, searchTrigger, HandleOpenForm, refreshList, setPagination }) => {
	const [termListing, setTermListing] = useState([]);
	const [fetchError, setFetchError] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [deleteLoading, setDeleteLoading] = useState(false)

	const { can } = useRole();
	useEffect(() => {
		const FetchTerms = async () => {
			setIsLoading(true);
			try {
				const result = await TermDB.FetchTerms(params);
				const arr = Array.isArray(result) ? result : (Array.isArray(result.data) ? result.data : []);
				if (!arr.length) {
					// Check if this is a filtered result (no terms match filters) vs actual error
					if (result?.filtered) {
						setFetchError({
							message: 'No terms match your filters',
							filtered: true
						});
					} else {
						// For empty results, don't set an error - just clear any previous errors
						setFetchError(null);
					}
					setTermListing([]);
					return;
				}
				setFetchError(null);
				setTermListing(arr);

				// Update pagination state in parent component (frontend-only)
				if (setPagination) {
					const total = arr.length;
					const limit = params.limit || 10;
					const page = params.page || 1;
					const totalPages = Math.ceil(total / limit);
					setPagination({ total, page, limit, totalPages });
				}
			} catch (err) {
				setFetchError({
					message: err.message || 'Unexpected error',
					filtered: false
				});
				setTermListing([]);
			} finally {
				setIsLoading(false);
			}
		};

		FetchTerms();
	}, [params, searchTrigger]);

	const GetMonthName = (monthNumber) => {
		const monthNames = [
			"January", "February", "March", "April", "May", "June",
			"July", "August", "September", "October", "November", "December"
		];
		return monthNames[monthNumber - 1] || "Invalid";
	};

	const HandleTermDelete = async (termId) => {
		try {
			if (!termId) {
				throw new Error("No term selected for deletion");
			}

			const result = await window.Swal.fire({
				title: 'Delete Term',
				text: 'Are you sure you want to delete this term? This action cannot be undone.',
				icon: 'warning',
				showCancelButton: true,
				confirmButtonColor: '#d33',
				cancelButtonColor: '#d33',
				confirmButtonText: 'Yes, delete it!',
				cancelButtonText: 'No, cancel'
			});

			if (!result.isConfirmed) return;
			setDeleteLoading((prev) => ({ ...prev, [termId]: true }));

			const response = await TermDB.DeleteTerm(termId);

			if (response.success) {
				await window.Swal.fire({
					title: 'Deleted!',
					text: response.message || 'Term deleted successfully.',
					icon: 'success',
					confirmButtonText: 'OK',
					confirmButtonColor: '#3085d6'
				});
				setDeleteLoading((prev) => ({ ...prev, [termId]: false }));
				refreshList();
			} else {
				await window.Swal.fire({
					title: 'Cannot Delete',
					text: 'Cannot delete term because it is referenced in other records',
					icon: 'error',
					confirmButtonText: 'OK',
					confirmButtonColor: '#d33'
				});
			}
			setDeleteLoading((prev) => ({ ...prev, [termId]: false }));

		} catch (err) {
			console.error("Delete error:", err);
			await window.Swal.fire({
				title: 'Error',
				text: `An error occurred while deleting the term: ${err.message || ''}`,
				icon: 'error',
				confirmButtonText: 'OK',
				confirmButtonColor: '#d33'
			});
		}
	};

	// Show loading state
	if (isLoading) {
		return (
			<tr>
				<td colSpan="7" className="text-center text-muted term-table-cell py-8">
					<div className="flex justify-center items-center">
						<svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-muted" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
							<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
							<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						Loading terms...
					</div>
				</td>
			</tr>
		);
	}

	// Show error state (only for actual errors, not empty results)
	if (fetchError && !fetchError.filtered) {
		return (
			<tr>
				<td colSpan="7" className="term-table-cell text-center text-red-600 py-8">
					Error: {fetchError.message}
				</td>
			</tr>
		);
	}

	// Show empty state
	if (Array.isArray(termListing) && termListing.length === 0) {
		return (
			<tr>
				<td colSpan="7" className="text-center text-muted term-table-cell py-8">
					<div className="flex items-center justify-center w-full h-full">
						{fetchError?.filtered ? 'No terms match your filters' : 'No terms found'}
					</div>
				</td>
			</tr>
		);
	}

	return (
		<>
			{termListing
				.slice(
					((params.page || 1) - 1) * (params.limit || 10),
					(params.page || 1) * (params.limit || 10)
				)
				.map((term, index) => (
					<tr
						key={index}
						className="table-row-hover cursor-pointer"
						onClick={() => HandleOpenForm('VIEW', term.id, term)}
					>
						<td className="term-table-cell-no">
							{((params.page - 1) * params.limit) + index + 1}
						</td>
						<td className="term-table-cell-name font-medium">{term.name}</td>
						<td className="term-table-cell-year">{term.year}</td>
						<td className="term-table-cell-month">{GetMonthName(term.month)}</td>
						<td className="term-table-cell-semtype">{term.semtype}</td>
						<td className="term-table-cell-status">
							<span className={
								term.status.toLowerCase() === 'published' ? 'badge-success' :
									term.status.toLowerCase() === 'unpublished' ? 'badge-warning' :
										'badge-error'
							}>
								{term.status.charAt(0).toUpperCase() + term.status.slice(1)}
							</span>
						</td>
						<td className="term-table-cell-actions text-center">
							<div className="flex space-x-2">

								{can('term', 'read') && (
									<button
										onClick={(e) => {
											HandleOpenForm('VIEW', term.id, term);
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

								{can('term', 'update') && (
									<button
										onClick={(e) => {
											HandleOpenForm('EDIT', term.id, term);
										}}
										className="text-indigo-600 hover:text-indigo-900 cursor-pointer"
										title="Edit unit type"
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

								{can('term', 'delete') && (
									deleteLoading[term.id] ? (
										<span className="flex items-center space-x-2 text-red-600">
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
											<span>Deleting...</span>
										</span>
									) : (
										<button
											onClick={(e) => {
												e.stopPropagation();
												HandleTermDelete(term.id);
											}}
											className={`text-red-600 hover:text-red-900 cursor-pointer`}
											title="Delete unit type"
										>
											<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
												/>
											</svg>
										</button>
									)
								)}
							</div>
						</td>
					</tr>
				))}
		</>
	);
};

export default TermListing;
