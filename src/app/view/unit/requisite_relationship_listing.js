'use client'
import { useState, useEffect, useRef } from "react"
import UnitOptionListing from "./unit_option_listing"
import { useLightDarkMode } from '@app/context/LightDarkMode';


const RequisiteRow = ({
	inputValue, HandleUnitInput, showOptions, HandleSelectUnits,
	SelectedUnitCode, SetShowOptions, selectedRelationship, selectedOperator,
	HandleRelationshipChange, HandleOperatorChange, HandleRemoveRow,
	isLastRow, mode, isNew, isModified, allUnits, theme
}) => {
	const wrapperRef = useRef(null)
	const isThemeDark = theme === 'dark';

	useEffect(() => {
		const HandleClickOutside = (event) => {
			// Check if click is on the confirmation dialog
			const confirmDialog = document.querySelector('.swal2-container');
			if (confirmDialog && confirmDialog.contains(event.target)) {
				return;
			}

			if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
				SetShowOptions(false)
			}
		}
		document.addEventListener("mousedown", HandleClickOutside)
		return () => {
			document.removeEventListener("mousedown", HandleClickOutside)
		}
	}, [SetShowOptions])

	return (
		<>
			<tr className={`${isNew ? "bg-green-100 text-gray-900" : ""} ${isModified ? "bg-yellow-200 text-gray-900" : ""}`}>
				<td className="p-2" colSpan={1}>
					<div className="relative" ref={wrapperRef}>
						<input
							type="text"
							className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
							placeholder="Search unit code or name..."
							value={inputValue}
							onChange={HandleUnitInput}
							readOnly={mode === "READ"}
						/>
						{showOptions && mode !== "READ" && (
							<div className="absolute z-10 top-full left-0 mt-1 w-sm">
								<div className="bg-white rounded-lg shadow-lg ">
									<UnitOptionListing
										unit_code={inputValue}
										selected_unit_code={SelectedUnitCode}
										onSelect={HandleSelectUnits}
										allUnits={allUnits}
									/>
								</div>
							</div>
						)}
					</div>
				</td>
				<td className="p-2" colSpan={2}>
					<select
						className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400  ${isThemeDark ? (!(isNew || isModified) ? "bg-gray-800" : "") : ""}`}
						value={selectedRelationship}
						onChange={HandleRelationshipChange}
						disabled={mode === "READ"}
					>
						<option value="pre">Pre-requisite</option>
						<option value="co">Co-requisite</option>
						<option value="anti">Anti-requisite</option>
					</select>
				</td>
				{mode !== "READ" && (
					<td className="p-2 text-center">
						<button
							type="button"
							onClick={HandleRemoveRow}
							className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-50 transition-colors"
						>
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</td>
				)}
			</tr>
			{!isLastRow && (
				<tr>
					<td colSpan={4} className={`p-2  ${theme === 'dark' ? 'text-white ' : 'text-gray-900'}`}>
						<select
							className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400  text-center font-medium ${isThemeDark ? 'bg-gray-900' : 'bg-gray-100'}`}
							value={selectedOperator}
							onChange={HandleOperatorChange}
							disabled={mode === "READ"}
						>
							<option value="or">OR</option>
							<option value="and">AND</option>
						</select>
					</td>
				</tr>
			)}
		</>
	)
}

const MinCPRow = ({
	minimum, selectedOperator, HandleMinimumChange,
	HandleOperatorChange, HandleRemoveRow, isLastRow, mode,
	isNew, isModified, theme
}) => (
	<>
		<tr className={`${isNew ? "bg-green-100 text-gray-900" : ""} ${isModified ? "bg-yellow-200 text-gray-900" : ""}`}>
			<td colSpan={3} className="p-2">
				<div className="flex items-center justify-center space-x-2">
					<span className="font-medium">Minimum Credit Points:</span>
					<input
						type="number"
						className="w-24 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400 text-center"
						value={minimum === '' ? '' : minimum}
						min={0}
						step="any"
						onChange={HandleMinimumChange}
						readOnly={mode === "READ"}
					/>
				</div>
			</td>
			{mode !== "READ" && (
				<td className="p-2 text-center">
					<button
						type="button"
						onClick={HandleRemoveRow}
						className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-50 transition-colors"
					>
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</td>
			)}
		</tr>
		{!isLastRow && (
			<tr>
				<td colSpan={4} className={`p-2  ${theme === 'dark' ? 'text-gray-900' : 'text-gray-900'}`}>
					<select
						className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400  text-center font-medium ${theme == "dark" ? 'bg-gray-900 text-gray-100' : 'bg-gray-100 text-gray-900'}`}
						value={selectedOperator}
						onChange={HandleOperatorChange}
						disabled={mode === "READ"}
					>
						<option value="or">OR</option>
						<option value="and">AND</option>
					</select>
				</td>
			</tr>
		)}
	</>
)

const RequisiteRelationshipListing = ({ UnitCode, mode, UpdateRequisiteRelationships, Requisites = [], allUnits }) => {
	const { theme } = useLightDarkMode();

	// Ensure Requisites is always an array and handle both direct array and structured change object
	const isChangeObject = Requisites &&
		typeof Requisites === 'object' &&
		(Requisites.modified || Requisites.added || Requisites.deleted);

	const requisitesArray = isChangeObject ?
		[...(Requisites.modified || []), ...(Requisites.added || [])] :
		Array.isArray(Requisites) ? Requisites :
			Requisites ? [Requisites] : [];

	// Store original data for tracking changes
	const [originalRequisites, setOriginalRequisites] = useState(
		requisitesArray.map(r => ({
			_id: r._id || null, // Database ID using _id as in your structure
			unit_id: r.unit_id,
			requisite_unit_id: r.requisite_unit_id ?? null,
			unit_relationship: r.unit_relationship,
			requisite_unit_code: r.requisite_unit_code,
			minCP: r.minCP ?? 0,
			operator: r.operator ?? "or",
			unit_code: r.unit_code ?? UnitCode
		}))
	);

	// Current state of requisites including modifications
	const [unitRelationships, setUnitRelationships] = useState(
		requisitesArray.map(r => ({
			_id: r._id || null, // Use _id from your structure
			unit_id: r.unit_id,
			requisite_unit_id: r.requisite_unit_id ?? null,
			unit_relationship: r.unit_relationship,
			requisite_unit_code: r.requisite_unit_code,
			minCP: r.minCP ?? 0,
			operator: r.operator ?? "or",
			unit_code: r.unit_code ?? UnitCode,
			isNew: !!r.isNew,
			isModified: !!r.isModified,
			isDeleted: false
		}))
	);

	// Update local state when props change
	useEffect(() => {

		// Only update if the prop is a new array and not the change structure we created
		if (!isChangeObject && JSON.stringify(Requisites) !== JSON.stringify(requisitesArray)) {
			const newRequisitesArray = Array.isArray(Requisites) ?
				Requisites : Requisites ? [Requisites] : [];

			setOriginalRequisites(
				newRequisitesArray.map(r => ({
					_id: r._id || null,
					unit_relationship: r.unit_relationship,
					requisite_unit_code: r.requisite_unit_code,
					minCP: r.minCP ?? 0,
					operator: r.operator ?? "or",
					unit_code: r.unit_code ?? UnitCode
				}))
			);

			setUnitRelationships(
				newRequisitesArray.map(r => ({
					_id: r._id || null,
					unit_relationship: r.unit_relationship,
					requisite_unit_code: r.requisite_unit_code,
					minCP: r.minCP ?? 0,
					operator: r.operator ?? "or",
					unit_code: r.unit_code ?? UnitCode,
					isNew: false,
					isModified: false,
					isDeleted: false
				}))
			);

			setInputStates(
				newRequisitesArray.map(r => ({
					inputValue: r.requisite_unit_code ?? "",
					showOptions: false,
				}))
			);

			setDeletedItems([]);
		}
	}, [Requisites, UnitCode, isChangeObject, requisitesArray]);

	// Track deleted items to pass to parent for DB cleanup
	const [deletedItems, setDeletedItems] = useState([]);

	const [inputStates, setInputStates] = useState(
		requisitesArray.map(r => ({
			inputValue: r.requisite_unit_code ?? "",
			showOptions: false,
		}))
	);

	const UpdateRelationships = (updated) => {
		setUnitRelationships(updated);

		// Create a structured object of changes for the parent component
		const changes = {
			modified: updated.filter(item => item.isModified && !item.isNew && item._id),
			added: updated.filter(item => item.isNew),
			deleted: deletedItems
		};

		UpdateRequisiteRelationships?.(changes);
	};

	const HandleUnitInput = (index, value) => {
		const updatedInputs = [...inputStates];
		updatedInputs[index].inputValue = value;
		updatedInputs[index].showOptions = value.trim().length > 0;

		const updatedRelationships = [...unitRelationships];
		updatedRelationships[index].requisite_unit_code = value.trim();

		if (!updatedRelationships[index].isNew) {
			updatedRelationships[index].isModified = true;
		}

		UpdateRelationships(updatedRelationships);
		setInputStates(updatedInputs);
	};

	const HandleSelectUnits = (index, unit) => {
		console.log('Selected unit:', unit);
		const updatedInputs = [...inputStates];
		updatedInputs[index].inputValue = unit.unit_code;
		updatedInputs[index].showOptions = false;
		setInputStates(updatedInputs);

		const updatedRelationships = [...unitRelationships];
		updatedRelationships[index].requisite_unit_code = unit.unit_code;
		updatedRelationships[index].requisite_unit_id = unit.id


		// Mark as modified if it's an existing item
		if (!updatedRelationships[index].isNew) {
			updatedRelationships[index].isModified = true;
		}

		UpdateRelationships(updatedRelationships);
	};

	const SetShowOptionsAtIndex = (index, value) => {
		const updatedInputs = [...inputStates];
		updatedInputs[index].showOptions = value;
		setInputStates(updatedInputs);
	};

	const HandleRelationshipChange = (index, value) => {
		const updated = [...unitRelationships];
		updated[index].unit_relationship = value;

		// Mark as modified if it's an existing item
		if (!updated[index].isNew) {
			updated[index].isModified = true;
		}

		UpdateRelationships(updated);
	};

	const HandleOperatorChange = (index, value) => {
		const updated = [...unitRelationships];
		updated[index].operator = value;

		// Mark as modified if it's an existing item
		if (!updated[index].isNew) {
			updated[index].isModified = true;
		}

		UpdateRelationships(updated);
	};

	const HandleMinimumChange = (index, e) => {
		const updated = [...unitRelationships];

		let value = e.target.value;

		// Allow only digits + one decimal point
		value = value.replace(/[^0-9.]/g, '');
		if ((value.match(/\./g) || []).length > 1) {
			value = value.substring(0, value.lastIndexOf("."));
		}

		// Remove leading zeros (except before a decimal like "0.5")
		value = value.replace(/^0+(?=\d)/, '');

		updated[index].minCP = value === '' ? '' : value;

		if (!updated[index].isNew) {
			updated[index].isModified = true;
		}

		UpdateRelationships(updated);
	};

	const HandleRemoveRow = (index) => {
		const itemToRemove = unitRelationships[index];

		// Create an updated deletedItems array immediately
		const updatedDeletedItems = [...deletedItems];

		// If it has an _id (existing in DB), mark for deletion
		if (itemToRemove._id) {
			updatedDeletedItems.push(itemToRemove._id);
		}

		const updatedR = unitRelationships.filter((_, i) => i !== index);
		const updatedI = inputStates.filter((_, i) => i !== index);

		// Update state with the new array
		setDeletedItems(updatedDeletedItems);
		setInputStates(updatedI);

		// Pass the updated deletedItems to ensure it has the current deletion
		const changes = {
			modified: updatedR.filter(item => item.isModified && !item.isNew && item._id),
			added: updatedR.filter(item => item.isNew),
			deleted: updatedDeletedItems
		};

		// Update state and notify parent with the changes
		setUnitRelationships(updatedR);
		UpdateRequisiteRelationships?.(changes);
	};

	const AddRequisiteRow = () => {
		const newRequisite = {
			unit_code: UnitCode,
			unit_relationship: "pre",
			requisite_unit_code: "",
			operator: "or",
			isNew: true,
			isModified: false,
			isDeleted: false
		};

		const newR = [...unitRelationships, newRequisite];
		const newI = [...inputStates, { inputValue: "", showOptions: false }];

		setInputStates(newI);
		UpdateRelationships(newR);
	};

	const AddMinCPRow = () => {
		// Check if a minimum CP row already exists
		const hasMinCP = unitRelationships.some(r => r.unit_relationship === "min");
		if (hasMinCP) {
			return; // Don't add another minimum CP row if one already exists
		}

		const newRequisite = {
			unit_code: UnitCode,
			unit_relationship: "min",
			minCP: 0,
			operator: "or",
			isNew: true,
			isModified: false,
			isDeleted: false
		};

		const newR = [...unitRelationships, newRequisite];
		const newI = [...inputStates, { inputValue: "", showOptions: false }];

		setInputStates(newI);
		UpdateRelationships(newR);
	};

	// Function to reset changes (cancel edits)
	const ResetChanges = () => {
		setUnitRelationships(originalRequisites.map(r => ({
			...r,
			isNew: false,
			isModified: false,
			isDeleted: false
		})));

		setInputStates(originalRequisites.map(r => ({
			inputValue: r.requisite_unit_code ?? "",
			showOptions: false,
		})));

		setDeletedItems([]);

		// Return original structure to parent
		UpdateRequisiteRelationships?.(originalRequisites);
	};

	// Display only non-deleted items
	const visibleRelationships = unitRelationships.filter(r => !r.isDeleted);

	return (
		<>
			{visibleRelationships.length === 0 && mode === "READ" ? (
				<tr>
					<td colSpan={4} className="p-4 text-center text-gray-500">
						No requisite relationships defined
					</td>
				</tr>
			) : (
				<>
					{visibleRelationships.map((r, index) => {
						const isMin = r.unit_relationship === "min";
						return isMin ? (
							<MinCPRow
								key={`min-cp-${index}`}
								minimum={r.minCP}
								selectedOperator={r.operator}
								HandleMinimumChange={(e) => HandleMinimumChange(index, e)}
								HandleOperatorChange={(e) => HandleOperatorChange(index, e.target.value)}
								HandleRemoveRow={() => HandleRemoveRow(index)}
								isLastRow={index === visibleRelationships.length - 1}
								mode={mode}
								isNew={r.isNew}
								isModified={r.isModified}
								theme={theme}
							/>
						) : (
							<RequisiteRow
								key={`req-row-${index}`}
								inputValue={inputStates[index]?.inputValue ?? ""}
								HandleUnitInput={(e) => HandleUnitInput(index, e.target.value)}
								showOptions={inputStates[index]?.showOptions ?? false}
								HandleSelectUnits={(code) => HandleSelectUnits(index, code)}
								SelectedUnitCode={UnitCode}
								SetShowOptions={(v) => SetShowOptionsAtIndex(index, v)}
								selectedRelationship={r.unit_relationship}
								HandleRelationshipChange={(e) => HandleRelationshipChange(index, e.target.value)}
								selectedOperator={r.operator}
								HandleOperatorChange={(e) => HandleOperatorChange(index, e.target.value)}
								HandleRemoveRow={() => HandleRemoveRow(index)}
								isLastRow={index === visibleRelationships.length - 1}
								mode={mode}
								isNew={r.isNew}
								isModified={r.isModified}
								allUnits={allUnits}
								theme={theme}
							/>
						);
					})}

					{mode !== "READ" && (
						<tr className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>
							<td colSpan={unitRelationships.some(r => r.unit_relationship === "min") ? 4 : 2} className="p-2">
								<button
									type="button"
									onClick={AddRequisiteRow}
									className="w-full h-24 px-2 border-2 border-dashed border-gray-300 rounded-lg  hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center space-x-2"
								>{/*plus icon*/}
									<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
										<path d="M12 5v14M5 12h14" />
									</svg>
									<span>Add a Requisite</span>
								</button>
							</td>
							<td colSpan={2} className="p-2">
								{!unitRelationships.some(r => r.unit_relationship === "min") && (
									<button
										type="button"
										onClick={AddMinCPRow}
										className="w-full h-24 px-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center space-x-2"
									>
										<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
											<path d="M12 5v14M5 12h14" />
										</svg>
										<span>Add Minimum CP</span>
									</button>
								)}
							</td>
						</tr>
					)}

					{(unitRelationships.some(r => r.isNew || r.isModified) || deletedItems.length > 0) && (
						<tr>
							<td colSpan={4} className="p-2 text-right">
								<button
									className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
									onClick={ResetChanges}
								>
									Cancel Changes
								</button>
							</td>
						</tr>
					)}
				</>
			)}
		</>
	);
};

export default RequisiteRelationshipListing;