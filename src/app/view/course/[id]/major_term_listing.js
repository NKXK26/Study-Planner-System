import React, { useState, useEffect } from 'react';
import TermDB from '@app/class/Term/termDB';
import Form from '@app/view/terms/form';
import { useRole } from '@app/context/RoleContext';
import { updateIntakesAfterAdd, createNewIntake } from '@app/view/course/[id]/intakeUtils';
import { useLightDarkMode } from '@app/context/LightDarkMode';
import InfoTooltip from '@components/InfoTooltip';

const GetMonthName = (month_num) => {
	const monthNames = [
		"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December"
	];
	return monthNames[month_num - 1] || "Invalid";
};

const MajorTermListing = ({ onOpen, onClose, onSelect, intakes, setIntakes }) => {
	const { theme } = useLightDarkMode();
	const { can } = useRole();
	const [allTerms, setAllTerms] = useState([]); // Store all terms
	const [filteredTerms, setFilteredTerms] = useState([]); // Store filtered terms
	const [showAddForm, setShowAddForm] = useState(false);
	const [selectedTerms, setSelectedTerms] = useState([]); // Store selected terms
	const [isLoading, setIsLoading] = useState(true); // Loading state
	const [searchParams, setSearchParams] = useState({
		name: "",
		year: "",
	});

	// Initial load effect - runs only once
	useEffect(() => {
		const fetchAllTerms = async () => {
			setIsLoading(true);
			try {
				const intakeIDs = [
					...(intakes.Added?.map(i => i._term_id) || []),
					...(intakes.Existing?.map(i => i._term_id) || []),
					...(intakes.Modified?.map(i => i._term_id) || [])
				].filter(Boolean);

				const params = {
					return: ["ID", "Name", "Month", "Year", "SemType"],
					order_by: [{ column: 'Year', ascending: false }],
				};

				const result = await TermDB.FetchTerms(params);
				const filteredData = result.data.filter(item => !intakeIDs.includes(item._id));

				setAllTerms(filteredData || []);
				setFilteredTerms(filteredData || []);
			} catch (error) {
				console.error("Error fetching terms:", error);
			} finally {
				setIsLoading(false);
			}
		};

		fetchAllTerms();
	}, [intakes]); // Only re-fetch when intakes change

	// Handle input field changes
	const handleInputChange = (e) => {
		const { name, value } = e.target;
		setSearchParams(prev => ({
			...prev,
			[name]: value,
		}));
	};

	// Handle term selection
	const handleTermSelect = (term) => {
		setSelectedTerms(prev => {
			const isSelected = prev.some(t => t._id === term._id);
			if (isSelected) {
				return prev.filter(t => t._id !== term._id);
			} else {
				return [...prev, term];
			}
		});
	};

	// Handle batch add
	const handleBatchAdd = () => {
		if (selectedTerms.length === 0) {
			window.Swal.fire({
				title: 'No Terms Selected',
				text: 'Please select at least one term to add.',
				icon: 'warning',
				confirmButtonText: 'OK'
			});
			return;
		}

		// Create new intakes for each selected term
		selectedTerms.forEach(term => {
			const newIntake = createNewIntake(term);
			setIntakes(prev => updateIntakesAfterAdd(prev, newIntake));
		});

		// Clear selections and close modal
		setSelectedTerms([]);
		onClose();
	};

	// Local search function
	const handleSearch = (e) => {
		e.preventDefault();
		const filtered = allTerms.filter(term => {
			const nameMatch = searchParams.name
				? term._name.toLowerCase().includes(searchParams.name.toLowerCase())
				: true;
			const yearMatch = searchParams.year
				? term._year.toString() === searchParams.year
				: true;
			return nameMatch && yearMatch;
		});
		setFilteredTerms(filtered);
	};

	// Handle refresh - refetch all terms
	const handleRefresh = async () => {
		setIsLoading(true);
		const intakeIDs = [
			...(intakes.Added?.map(i => i._term_id) || []),
			...(intakes.Existing?.map(i => i._term_id) || []),
			...(intakes.Modified?.map(i => i._term_id) || [])
		].filter(Boolean);

		const params = {
			return: ["ID", "Name", "Month", "Year", "SemType"],
			order_by: [{ column: 'Year', ascending: false }],
			exclude: {
				ID: intakeIDs
			}
		};

		try {
			const result = await TermDB.FetchTerms(params);
			setAllTerms(result.data || []);
			setFilteredTerms(result.data || []);
			setSearchParams({ name: "", year: "" }); // Reset search params
		} catch (error) {
			console.error("Error refreshing terms:", error);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<>
			{(showAddForm && can("term", "create")) && (
				<div className="fixed inset-0 flex items-center justify-center z-50">
					<Form
						mode="ADD"
						onClose={() => setShowAddForm(false)}
						RefreshList={handleRefresh}
					/>
				</div>
			)}

			<div className="p-4 w-full max-h-[80vh] flex flex-col overflow-y-auto">
				{/* Title Bar */}
				{/* // <div className="modal-title-bar">
				// 	<h2 className="modal-title">Available Intakes</h2> */}
				<div className="flex justify-between items-center mb-5">
					<h2 className="listing-modal-title">
						Available Intakes
					</h2>
					<button
						onClick={onClose}
						className="listing-close-btn"
					>
						Close
					</button>
				</div>

				{/* Search Form */}
				<form onSubmit={handleSearch} className="mb-4">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
						<div>
							<label htmlFor="name" className="label-text block text-sm font-medium mb-1">Name</label>
							<input
								className="input-field-alt border rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-200 focus:outline-none"
								type="text"
								name="name"
								value={searchParams.name}
								onChange={handleInputChange}
								placeholder="e.g. 2025_JAN_ST"
							/>
						</div >
						<div>
							<label htmlFor="year" className="label-text block text-sm font-medium mb-1">Year</label>
							<input
								className="input-field-alt border rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-200 focus:outline-none"
								type="number"
								name="year"
								value={searchParams.year}
								onChange={handleInputChange}
								placeholder="e.g. 2025"
							/>
						</div >
					</div >
					<div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-between items-stretch sm:items-center w-full">
						<div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
							<button
								type="submit"
								disabled={isLoading}
								className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg font-semibold transition-colors w-full sm:w-auto"
							>
								{isLoading ? 'Searching...' : 'Search'}
							</button>
							<button
								type="button"
								onClick={handleRefresh}
								disabled={isLoading}
								className="btn-secondary px-5 py-2 rounded-lg font-semibold transition-colors w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{isLoading ? 'Loading...' : 'Reset Filter'}
							</button>
						</div>
						{(showAddForm && can("term", "create")) && (
							<div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto mt-2 sm:mt-0">
								<button
									type="button"
									onClick={() => setShowAddForm(true)}
									className="bg-green-500 hover:bg-green-600 text-white px-5 py-2 rounded-lg font-semibold transition-colors w-full sm:w-auto"
								>
									Add Term
								</button>
							</div>
						)}
					</div>
				</form >

				{/* Term List */}
				< div className="pt-2 pb-2" >
					<div className="flex justify-center items-center gap-5">
						{isLoading ? (
							<div className="flex flex-col items-center justify-center w-full py-20">
								<div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-gray-500 mb-4"></div>
								<p className="text-muted text-lg">Loading terms...</p>
							</div>
						) : filteredTerms.length > 0 ? (
							<div className="h-96 overflow-y-auto space-y-2 p-2 w-[50%]">
								{filteredTerms.map((term) => (
									<div
										key={term._id}
										className="listing-table-row border border-divider rounded-lg cursor-pointer hover:border-blue-500 transition-all p-3 flex items-center gap-3"
										onClick={() => handleTermSelect(term)}
									>
										<input
											type="checkbox"
											checked={selectedTerms.some(t => t._id === term._id)}
											onChange={() => handleTermSelect(term)}
											onClick={(e) => e.stopPropagation()}
											className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
										/>
										<div className="flex-1 min-w-0">
											<p className="font-semibold text-base text-primary truncate">{term._name}</p>
											<p className="text-muted text-sm">{GetMonthName(term._month)} {term._year} · <span className="capitalize">{term._semtype}</span></p>
										</div>
									</div>
								))}
							</div>
						) : (
							<p className="text-muted text-center w-full py-10">No terms found.</p>
						)}
						{/* Selected Terms Section */}
						{selectedTerms.length > 0 && (
							<div className="h-96 overflow-y-auto p-2 w-[50%]">
								<div className="flex items-center justify-between mb-3 pb-2 border-b border-divider">
									<h3 className="text-lg font-semibold text-primary">Selected ({selectedTerms.length})</h3>
									<button
										onClick={() => setSelectedTerms([])}
										className="text-red-500 hover:text-red-700 text-sm font-medium"
									>
										Clear All
									</button>
								</div>
								<div className="space-y-2">
									{selectedTerms.map(term => (
										<div key={term._id} className="listing-table-row border border-divider rounded-lg p-3 flex items-center justify-between">
											<div className="flex-1 min-w-0">
												<p className="font-medium text-primary truncate">{term._name}</p>
												<p className="text-muted text-sm">{GetMonthName(term._month)} {term._year}</p>
											</div>
											<button
												onClick={() => handleTermSelect(term)}
												className="text-red-500 hover:text-red-700 text-sm font-medium ml-2 flex-shrink-0"
											>
												Remove
											</button>
										</div>
									))}
								</div>
							</div>
						)}
					</div>

				</div>

				{/* Batch Add Button */}
				<div className="mt-4 flex justify-center">
					<button
						onClick={handleBatchAdd}
						disabled={isLoading || selectedTerms.length === 0}
						className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-semibold transition-colors text-lg"
					>
						Add Selected Intakes ({selectedTerms.length})
					</button>
				</div>
			</div>
		</>
	);
};

export default MajorTermListing;