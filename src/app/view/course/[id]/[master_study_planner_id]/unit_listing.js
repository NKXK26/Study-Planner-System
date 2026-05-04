import React, { useEffect, useState, useRef } from 'react'
import UnitDB from '@app/class/Unit/UnitDB'
import UnitTermOfferedDB from '@app/class/UnitTermOffered/UnitTermOfferedDB'
import UnitRequisitesDisplay from '@app/view/unit/unit_requisite_display'
import InfoTooltip from '@components/InfoTooltip'

const UnitListing = ({ onClose, term, onUnitSelect, selectedUnitIndex, planner, currentUnit, yearNumber, semesterIndex, master_mode = true, is_suggesting = false }) => {
	const [unitsOffered, setUnitsOffered] = useState([]);
	const [unitsNotOffered, setUnitsNotOffered] = useState([]);
	const [searchTerm, setSearchTerm] = useState('');
	const [currentUnitKeywords, setCurrentUnitKeywords] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const keywordsToIgnore = ['the', 'and', 'of', 'in', 'for', 'to', 'a', 'is', 'introduction', 'advanced', 'basic', 'foundation', 'introductory'];
	const isFetching = useRef(false);

	const [completedUnits, setCompletedUnits] = useState([]);

	const searchInputRef = useRef(null);

	useEffect(() => {
		// Focus the search input when modal opens
		if (searchInputRef.current) {
			searchInputRef.current.focus();
		}
	}, []);

	const FetchUnits = async () => {
		if (isFetching.current) return;
		isFetching.current = true;
		setIsLoading(true);
		const params = {
			term_type: term,
			order_by: [{ column: 'UnitCode', ascending: true }],
			return: ['UnitCode']
		};
		try {
			if (!master_mode) {
				const passedUnits = planner.GetAllPassedUnits();;
				setCompletedUnits(passedUnits);;
			}
			const units_offered = await UnitTermOfferedDB.FetchTermOffered(params);
			const units = await UnitDB.FetchUnits({ order_by: [{ column: 'UnitCode', ascending: true }] });
			if (units_offered.success) {
				// If suggestion mode is on, then add each of currentUnit's name as keywords
				if (is_suggesting && currentUnit && currentUnit.unit && currentUnit.unit.name) {
					let current_unit_name = currentUnit.unit.name
					let current_unit_keywords = current_unit_name.toLowerCase().split(/[\s-]+/).filter(word => word) //Filter by "-" and " " to get keywords
					setCurrentUnitKeywords(current_unit_keywords);
				}
				const unit_code_offered = units_offered.data.map(unit => unit._unit_code);
				const units_offered_obj = units.data.filter(unit => unit_code_offered.includes(unit._unit_code));
				setUnitsNotOffered(units.data.filter(unit => !unit_code_offered.includes(unit._unit_code)));
				setUnitsOffered(units_offered_obj);
			} else {
				setUnitsNotOffered(units.data);
				setUnitsOffered([]);
			};
		} finally {
			setIsLoading(false);
			isFetching.current = false;
		}
	};

	useEffect(() => {
		FetchUnits();
	}, [term]);

	const modalRef = useRef(null);

	useEffect(() => {
		function handleClickOutside(event) {
			if (modalRef.current && !modalRef.current.contains(event.target)) {
				onClose();
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [onClose]);

	// Get all unit codes that are already in the planner with their positions
	const getExistingUnits = () => {
		const existingUnits = new Map();
		planner.years.forEach(year => {
			year.semesters.forEach(semester => {
				semester.units.forEach((unit, unitIndex) => {
					if (unit.unit?.code) {
						const position = planner.GetUnitPosition(unit.unit.code, master_mode, false, unit.unit.unit_id);
						if (position) {
							// existingUnits.set(unit.unit.code, position);
							existingUnits.set(unit.unit.unit_id, position);
						}
					}
				});
			});
		});
		return existingUnits;
	};

	const existingUnits = getExistingUnits();
	const filteredUnits = [...unitsOffered, ...unitsNotOffered]
		.map(unit => {
			const isOffered = unitsOffered.some(offeredUnit => offeredUnit._id === unit._id);
			const isInPlanner = existingUnits.has(unit._id);
			let isSuggested = false;

			if (is_suggesting && isOffered && !isInPlanner) {
				const target_unit_keywords = unit._name.toLowerCase().split(/[\s-]+/).filter(word => word);
				const filtered_keywords = target_unit_keywords.filter(word => !keywordsToIgnore.includes(word));
				isSuggested = filtered_keywords.some(keyword => currentUnitKeywords.includes(keyword));
			}

			return { ...unit, isOffered, isInPlanner, isSuggested };
		})
		.filter(unit => {
			// Filter out completed units (passed)
			if (!master_mode && completedUnits.length > 0) {
				const isPassed = completedUnits.some(
					completedUnit =>
						completedUnit.unit &&
						completedUnit.unit.code &&
						completedUnit.unit.code.toLowerCase() === unit._unit_code.toLowerCase() &&
						completedUnit.status.toLowerCase() === "pass"
				);
				if (isPassed) return false;
			}

			// Apply search filtering
			return (
				unit._unit_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
				unit._name.toLowerCase().includes(searchTerm.toLowerCase())
			);
		})
		.sort((a, b) => {
			if (a.isSuggested !== b.isSuggested) return a.isSuggested ? -1 : 1;

			if (a.isOffered !== b.isOffered) return a.isOffered ? -1 : 1;

			const availabilityOrder = { published: 1, unpublished: 2, unavailable: 3 };
			const aRank = availabilityOrder[a._availability?.toLowerCase()] ?? 99;
			const bRank = availabilityOrder[b._availability?.toLowerCase()] ?? 99;
			if (aRank !== bRank) return aRank - bRank;

			if (a.isInPlanner !== b.isInPlanner) return a.isInPlanner ? 1 : -1;

			return a._unit_code.localeCompare(b._unit_code);
		});

	const handleUnitSelect = async (unit) => {
		try {
			let title = "";
			let html = "";
			let proceed = false;

			// Check if the unit is offered
			const isOffered = unitsOffered.some(u => u._unit_code === unit._unit_code);

			// Check requisites
			const requisiteResult = planner.CheckUnitRequisites(unit, yearNumber, semesterIndex, master_mode);

			// Decide what to show
			if (!requisiteResult.isValid) {
				title = "Requisite Check Failed";
				html = `
		The unit <b>${unit._unit_code}</b> (${unit._name}) does not meet the following requirements:
		<br><br>${requisiteResult.messages.join('<br>')}
		${!isOffered ? '<br><br><b>AND</b><br>This unit is not offered in ' + term + '.' : ''}
		<br><br>Are you sure you want to proceed?
	`;
			} else if (!isOffered) {
				title = "Unit Not Offered";
				html = `The unit ${unit._unit_code} (${unit._name}) is not offered in ${term}. Are you sure you want to take this unit?`;
			} else if (unit._availability?.toLowerCase() !== "published") {
				title = `Unit Availability: ${unit._availability}`;
				html = `The unit ${unit._unit_code} (${unit._name}) has an availability status of ${unit._availability}. Are you sure you want to take this unit?`;
			}

			// If a warning needs to be shown
			if (title) {
				const result = await Swal.fire({
					title,
					html,
					icon: 'warning',
					showCancelButton: true,
					confirmButtonColor: '#d33',
					cancelButtonColor: '#3085d6',
					confirmButtonText: 'Yes, proceed!',
					cancelButtonText: 'Cancel'
				});
				proceed = result.isConfirmed;
			} else {
				proceed = true; // No issues, can proceed directly
			}

			// If user confirmed
			if (proceed) {
				const existingUnit = existingUnits.get(unit._id);
				onUnitSelect(unit, selectedUnitIndex, existingUnit || null, isOffered);
				onClose();
			}
		} catch (error) {
			console.error('Error handling unit selection:', error);
		}
	};

	return (
		<>
			{/* This is where the pop up for all the units that are currently in the database, changes can be made here */}
			<div className="modal-backdrop">
				<div ref={modalRef} className="listing-units-studyplanner">
					<div className="flex justify-between items-center mb-5">
						<h2 className="listing-modal-title">
							Unit Listing For Term:&nbsp;{term}
							<InfoTooltip
								content="Browse and select units to add to this semester. Units are categorized as 'Offered' (available in this term) or 'Not Offered' (available but not in this term). You can search by unit code or name, and view unit requisites and details."
								position='right'
								className='ml-2'
							/>
						</h2>
						<button onClick={onClose} className="listing-close-btn">
							Close
						</button>
					</div>
					<div className="mb-4">
						<input
							ref={searchInputRef}
							type="text"
							placeholder="Search by unit code or name..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									if (filteredUnits.length > 0) {
										console.log('filteredUnits[0]', filteredUnits[0])
										handleUnitSelect(filteredUnits[0]);
									}
								}
							}}
							disabled={isLoading}
							className="listing-search-input disabled:opacity-50 disabled:cursor-not-allowed"
						/>
					</div>
					<div className="overflow-y-auto">
						<table className="listing-table">
							<thead className="listing-table-header">
								<tr>
									<th className="listing-table-th">Unit Code</th>
									<th className="listing-table-th">Unit Name</th>
									<th className="listing-table-th text-center">Credit Points</th>
									<th className="listing-table-th text-center">Requisites</th>
									<th className="listing-table-th text-center">Status</th>
									<th className="listing-table-th text-center w-[15%]">Is Offered</th>
								</tr>
							</thead>
							<tbody>
								{isLoading ? (
									<tr>
										<td colSpan={6} className='listing-table-no-data'>
											<div className="flex flex-col items-center justify-center py-8">
												<div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-3"></div>
												<p className="text-muted text-base">Loading units...</p>
											</div>
										</td>
									</tr>
								) : (unitsOffered.length <= 0 && unitsNotOffered.length <= 0) ? (
									<tr>
										<td colSpan={6} className='listing-table-no-data'>
											No Units Available
										</td>
									</tr>
								) : null}
								{!isLoading && filteredUnits.map((unit) => {
									const isOffered = unit.isOffered;
									const isInPlanner = unit.isInPlanner;
									const is_suggested_unit = unit.isSuggested;

									// Build className dynamically
									let rowClassName = 'listing-table-row';
									if (!isOffered) rowClassName += ' listing-table-row-not-offered';
									if (isInPlanner) rowClassName += ' listing-table-row-in-planner';
									if (is_suggested_unit) rowClassName += ' listing-table-row-suggested';

									return (
										<tr
											onClick={() => handleUnitSelect(unit)}
											key={unit._id}
											className={rowClassName}
										>
											<td className="listing-table-cell">{unit._unit_code}</td>
											<td className="listing-table-cell">{unit._name}  {is_suggested_unit ? "(Suggested Unit)" : ""}</td>
											<td className="listing-table-cell text-center">{unit._credit_points}</td>
											<td className="listing-table-cell">
												<UnitRequisitesDisplay unit={unit} />
											</td>
											<td className="listing-table-cell text-center">
												<span className={`border border-gray-400 px-2 py-1 rounded-full text-sm ${unit._availability.toLowerCase() === 'published'
													? 'bg-green-100 text-green-800'
													:
													unit._availability.toLowerCase() === "unpublished" ?
														'bg-yellow-100 text-yellow-800'
														:
														'bg-red-100 text-red-800'
													}`}>
													{unit._availability.charAt(0).toUpperCase() + unit._availability.slice(1)}
												</span>
											</td>
											<td className="listing-table-cell text-center">
												<span className={`border border-gray-400 px-2 py-1 rounded-full text-sm ${isOffered
													? "bg-green-100 text-green-800"
													: "bg-red-100 text-red-800"
													}`}>
													{isOffered ? "Offered" : "Not Offered"}
												</span>
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</>
	)
}

export default UnitListing