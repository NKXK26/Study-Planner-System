import React, { useRef, useEffect, useState, useMemo } from 'react';
import StudyPlanner from '@app/class/StudyPlanner/StudyPlanner';
import Year from './year';
import InfoTooltip from '@components/InfoTooltip';
const CourseIntakeList = ({ onClose, ImportPlanner, available_intakes, unit_types }) => {
	const modalRef = useRef(null);
	const tooltipRef = useRef(null);
	const [searchTerm, setSearchTerm] = useState("");
	const [hoveredIntakes, setHoveredIntakes] = useState(null);
	const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
	const [tooltipVisible, setTooltipVisible] = useState(false);
	const [activeRowId, setActiveRowId] = useState(null);
	const [tooltipLoading, setTooltipLoading] = useState(false);
	const [studyPlanner, setStudyPlanner] = useState(null);
	const hideTimeoutRef = useRef(null);
	const loadTimeoutRef = useRef(null);

	const status_styles = {
		"Complete": "badge-success",
		"Draft": "badge-warning",
		"Empty": "badge-error"
	};

	const order = { Complete: 1, Draft: 2, Empty: 3 };

	// Memoized filtering & sorting
	const filter_intakes = useMemo(() => {
		return available_intakes.data
			.filter(intake => {
				const status = intake.MasterStudyPlanner?.[0]?.Status || "Empty";

				// only allow those with valid statuses
				if (!["Complete", "Draft", "Empty"].includes(status)) return false;

				// search matching (case insensitive)
				const term = searchTerm.toLowerCase();
				return (
					intake.Term.Name.toLowerCase().includes(term) ||
					status.toLowerCase().includes(term) ||
					intake.Term.Year.toString().includes(term) ||
					intake.Term.Month.toString().includes(term)
				);
			})
			.sort((a, b) => {
				const statusA = a.MasterStudyPlanner?.[0]?.Status || "Empty";
				const statusB = b.MasterStudyPlanner?.[0]?.Status || "Empty";

				// primary: custom status order
				if (order[statusA] !== order[statusB]) {
					return order[statusA] - order[statusB];
				}

				// secondary: year
				if (a.Term.Year !== b.Term.Year) {
					return a.Term.Year - b.Term.Year;
				}

				// tertiary: month
				return a.Term.Month - b.Term.Month;
			});
	}, [searchTerm]);

	useEffect(() => {
		if (!hoveredIntakes) return;

		const master_study_planner_id = hoveredIntakes.MasterStudyPlanner?.[0]?.ID;
		if (!master_study_planner_id) return;

		const fetchStudyPlanner = async () => {
			const sp = new StudyPlanner();
			await sp.Init(master_study_planner_id);
			setStudyPlanner(sp);
			setTooltipLoading(false);
		};

		fetchStudyPlanner();
	}, [hoveredIntakes]);


	// Handle tooltip positioning to prevent going off-screen
	const getTooltipPosition = (x, y) => {
		const tooltipWidth = 320;
		const tooltipHeight = 200;
		const padding = 15;

		let left = x + padding;
		let top = y;

		// Adjust if tooltip would go off right edge
		if (left + tooltipWidth > window.innerWidth) {
			left = x - tooltipWidth - padding;
		}

		// Adjust if tooltip would go off bottom edge
		if (top + tooltipHeight > window.innerHeight) {
			top = window.innerHeight - tooltipHeight - padding;
		}

		// Ensure tooltip doesn't go off top edge
		if (top < padding) {
			top = padding;
		}

		return { left, top };
	};

	const handleMouseEnter = (e, intakes) => {
		const { left, top } = getTooltipPosition(e.clientX, e.clientY);
		const rowId = intakes.ID || intakes.Term.Name;

		// Clear any pending hide timeout
		if (hideTimeoutRef.current) {
			clearTimeout(hideTimeoutRef.current);
			hideTimeoutRef.current = null;
		}

		// Clear any pending load timeout
		if (loadTimeoutRef.current) {
			clearTimeout(loadTimeoutRef.current);
			loadTimeoutRef.current = null;
		}

		// Immediately show tooltip in loading state
		setHoveredIntakes(intakes);
		setMousePos({ x: left, y: top });
		setTooltipVisible(true);
		setTooltipLoading(true);
		setActiveRowId(rowId);

		// Set timeout to show actual content after 4 seconds
		loadTimeoutRef.current = setTimeout(() => {
			setTooltipLoading(false);
			loadTimeoutRef.current = null;
		}, 500);
	};

	const handleMouseLeave = (intakes) => {
		const rowId = intakes.ID || intakes.Term.Name;

		// Only process if this is the currently active row
		if (activeRowId === rowId) {
			// Clear load timeout if still loading
			if (loadTimeoutRef.current) {
				clearTimeout(loadTimeoutRef.current);
				loadTimeoutRef.current = null;
			}

			// Set a timeout to hide, but it can be cancelled if we enter tooltip or another row
			hideTimeoutRef.current = setTimeout(() => {
				setTooltipVisible(false);
				setHoveredIntakes(null);
				setActiveRowId(null);
				setTooltipLoading(false);
				hideTimeoutRef.current = null;
			}, 150);
		}
	};

	const handleTooltipMouseEnter = () => {
		// Cancel hide timeout when entering tooltip
		if (hideTimeoutRef.current) {
			clearTimeout(hideTimeoutRef.current);
			hideTimeoutRef.current = null;
		}
	};

	const handleTooltipMouseLeave = () => {
		// Clear load timeout if still loading
		if (loadTimeoutRef.current) {
			clearTimeout(loadTimeoutRef.current);
			loadTimeoutRef.current = null;
		}

		setTooltipVisible(false);
		setHoveredIntakes(null);
		setActiveRowId(null);
		setTooltipLoading(false);
	};

	// Cleanup timeouts on unmount
	useEffect(() => {
		return () => {
			if (hideTimeoutRef.current) {
				clearTimeout(hideTimeoutRef.current);
			}
			if (loadTimeoutRef.current) {
				clearTimeout(loadTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		function handleClickOutside(event) {
			// If clicking inside SweetAlert, ignore
			const swalContainer = document.querySelector('.swal2-container');
			if (swalContainer && swalContainer.contains(event.target)) {
				return;
			}
	
			// Normal outside-click handling
			if (modalRef.current && !modalRef.current.contains(event.target)) {
				onClose();
			}
		}
	
		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [onClose]);

	const handleRowClick = (intakes) => {
		window.Swal.fire({
			title: 'Import Planner from ' + intakes.Term.Name,
			text: 'Importing ' + intakes.Term.Name + ' will remove all the data in the current planner',
			showCancelButton: true,
			confirmButtonColor: '#008236',
			cancelButtonColor: '#d33',
			confirmButtonText: 'Yes, import data',
			cancelButtonText: 'No, cancel import'
		}).then((result) => {
			if (result.isConfirmed) {
				ImportPlanner(intakes.ID);
				onClose();
			}
		});
	};

	return (
		<div className="modal-backdrop">
			<div ref={modalRef} className="listing-units-studyplanner">
				<div className='flex justify-between items-center mb-5'>
					<h2 className="listing-modal-title">
						Available Intakes
						<InfoTooltip
							content="To import an Intake, there are two key rules,which is intake can only add intake that have the same semester type in the same major"
							position='right'
							className='ml-2'
						/>
					</h2>
					<button
						onClick={onClose}
						className="listing-close-btn"
					>
						Close
					</button>
				</div>

				{/* Search Box */}
				<div className="mb-4">
					<input
						type="text"
						placeholder="Search by intake name, status, year or month"
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						className="input-field-alt w-full p-3 rounded-md border focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
					/>
				</div>

				{/* Table */}
				<div className="overflow-auto relative">
					<table className="w-full border-collapse">
						<thead className="table-header sticky top-0">
							<tr>
								<th className="listing-table-cell text-left font-semibold text-primary">Intake Name</th>
								<th className="listing-table-cell text-left font-semibold text-primary">Status</th>
								<th className="listing-table-cell text-left font-semibold text-primary">Year</th>
								<th className="listing-table-cell text-left font-semibold text-primary">Month</th>
							</tr>
						</thead>
						<tbody>
							{filter_intakes.length <= 0 ? (
								<tr>
									<td colSpan={4} className='listing-table-cell text-center py-8 text-muted'>
										No Intakes Found
									</td>
								</tr>
							) : (
								filter_intakes.map((intakes) => {
									const status = intakes.MasterStudyPlanner?.[0]?.Status || "Empty";
									const capitalised_status = status.charAt(0).toUpperCase() + status.slice(1);
									const style = status_styles[status] || "badge-info";

									return (
										<tr
											key={intakes.ID || intakes.Term.Name}
											className='listing-table-row cursor-pointer transition-colors duration-150'
											onMouseEnter={(e) => handleMouseEnter(e, intakes)}
											onMouseLeave={() => handleMouseLeave(intakes)}
											onClick={() => handleRowClick(intakes)}
										>
											<td className="listing-table-cell text-primary">{intakes.Term.Name}</td>
											<td className="listing-table-cell">
												<span className={style}>
													{capitalised_status}
												</span>
											</td>
											<td className="listing-table-cell text-primary">{intakes.Term.Year}</td>
											<td className="listing-table-cell text-primary">{intakes.Term.Month}</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				</div>

				{/* Enhanced Tooltip */}
				{tooltipVisible && hoveredIntakes && (() => {
					return (
						<div
							ref={tooltipRef}
							className="card-bg fixed w-150 max-h-64 shadow-2xl rounded-lg border border-gray-200 p-4 text-sm z-50 overflow-auto"
							style={{ top: mousePos.y, left: mousePos.x }}
							onMouseEnter={handleTooltipMouseEnter}
							onMouseLeave={handleTooltipMouseLeave}
						>
							{tooltipLoading ? (
								<div className="flex items-center justify-center min-h-[100%]">
									<div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
								</div>
							) : (
								<>
									<div className="mt-3 pt-2 border-t border-divider">
										<p className="text-xs text-muted italic">
											Click the row to import this intake
										</p>
									</div>
									{studyPlanner && studyPlanner.years.map((year, index) => (
										<div key={index} className="border border-divider rounded-lg p-4 text-black">
											<div className="flex justify-between items-center">
												<h3 className="text-3xl font-bold mb-1 text-primary">Year {year.year}</h3>
											</div>
											<Year
												year={year}
												planner={studyPlanner}
												setStudyPlanner={null}
												unitTypes={unit_types}
												is_read_only={true}
											/>
										</div>
									))}
								</>
							)}
						</div>
					);
				})()}
			</div>
		</div>
	);
};

export default CourseIntakeList;