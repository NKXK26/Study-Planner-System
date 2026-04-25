import { React, useState } from 'react'
import UnitTypeDropdown from '@app/view/course/[id]/[master_study_planner_id]/unit_type_dropdown'
import UnitRequisitesDisplay from '@app/view/unit/unit_requisite_display'
import UnitListing from '@app/view/course/[id]/[master_study_planner_id]/unit_listing'

const Semester = ({ sem, yearNumber, semesterIndex, studentStudyPlanner, setStudyPlanner, updateStudentStudyPlanner, unitTypes, isComplete, isReadOnly, isDarkMode }) => {
	const [openUnitForm, setOpenUnitForm] = useState(false)
	const [selectedUnitIndex, setSelectedUnitIndex] = useState(null)

	const handleUnitForm = (unit, unitIndex) => {
		setOpenUnitForm(true)
		setSelectedUnitIndex(unitIndex)
	}

	// Helper function to update conflicts after making changes
	const updateConflictsState = (updatedPlanner) => {
		// Get conflicts from the updated planner
		const conflicts = updatedPlanner.GetAllConflicts();

		// Return the updated planner with conflicts for state update
		return updatedPlanner;
	};

	const onUnitSelect = (unit, unitIndex, existingUnitPosition, isOffered = true) => {
		try {
			let new_planner;

			if (existingUnitPosition) {
				// If unit exists in planner, swap positions
				const new_unit = studentStudyPlanner.StudyPlanner.GetUnit(unit._unit_code, false)

				new_planner = studentStudyPlanner.StudyPlanner.SwapUnits(
					existingUnitPosition.year,
					existingUnitPosition.semesterIndex,
					existingUnitPosition.unitIndex,
					yearNumber,
					semesterIndex,
					unitIndex,
					false
				);

				const new_unit_type_id = new_unit?.unit?.unit_type?._type_id ?? null;
				const old_unit_type_id = sem?.units?.[unitIndex]?.unit_type?._type_id ?? null;
				if (sem.units[unitIndex].unit_type?._name != "Empty" && sem.units[unitIndex].unit.name != null) {
					studentStudyPlanner.MakeAmendments(
						sem.units[unitIndex].unit.code,
						unit._unit_code,
						old_unit_type_id,
						new_unit_type_id,
						yearNumber,
						semesterIndex,
						'swapped',
						sem.sem_type,
						sem.sem_id,
						sem.units[unitIndex].unit.unit_id,
						unit._id,
					)
					studentStudyPlanner.MakeAmendments(
						unit._unit_code,
						sem.units[unitIndex].unit.code,
						new_unit_type_id,
						old_unit_type_id,
						existingUnitPosition.year,
						existingUnitPosition.semesterIndex,
						'swapped',
						sem.sem_type,
						existingUnitPosition.semID,
						unit._id,
						sem.units[unitIndex].unit.unit_id,
					)
				} else {
					studentStudyPlanner.MakeAmendments(
						sem.units[unitIndex].unit.code,
						unit._unit_code,
						old_unit_type_id,
						new_unit_type_id,
						yearNumber,
						semesterIndex,
						'swapped',
						sem.sem_type,
						sem.sem_id,
						sem.units[unitIndex].unit.unit_id,
						unit._id,
					)
				}

			} else {
				// If unit is new, just add it
				new_planner = studentStudyPlanner.StudyPlanner.EditUnitInUnitRow(yearNumber, semesterIndex, unitIndex, {
					unit_id: unit._id,
					unit_code: unit._unit_code,
					unit_name: unit._name,
					unit_cp: unit._credit_points,
					unit_requisites: unit._requisites,
					unit_type: sem.units[unitIndex].unit_type,
					is_offered: isOffered,
					unit_availability: unit._availability
				});
				const old_unit_type_id = sem?.units?.[unitIndex]?.unit_type?._type_id ?? null;
				studentStudyPlanner.MakeAmendments(
					sem.units[unitIndex].unit.code,
					unit._unit_code,
					old_unit_type_id,
					old_unit_type_id,
					yearNumber,
					semesterIndex,
					'replaced',
					sem.sem_type,
					sem.sem_id,
					sem.units[unitIndex].unit.unit_id,
					unit._id
				)
			}
			console.log('new_planner', new_planner)

			// Update conflicts and set the planner state
			const updatedPlannerWithConflicts = updateConflictsState(new_planner);

			setStudyPlanner(prev =>
				updateStudentStudyPlanner(prev, () => updatedPlannerWithConflicts)
			);
		} catch (error) {
			console.error('Error in onUnitSelect:', error);
		}
	}

	const clearUnitRow = (index) => {
		const new_planner = studentStudyPlanner.StudyPlanner.EditUnitInUnitRow(yearNumber, semesterIndex, index, {
			unit_type: null,
			unit_code: null,
			unit_name: null,
			unit_cp: 0,
			unit_requisites: [],
			has_conflict: false,
			unit_availability: null
		},
			'planned',
			false
		);
		if (sem.units[index]) {
			if (sem.units[index].unit_type?._name != "Empty") {
				const old_unit_type_id = sem?.units?.[index]?.unit_type?._type_id ?? null;
				studentStudyPlanner.MakeAmendments(sem.units[index].unit.code, null, old_unit_type_id, -1, yearNumber, semesterIndex, 'deleted', sem.sem_type, sem.sem_id, sem.units[index].unit.unit_id)
			}
		}

		// Update conflicts and set the planner state
		const updatedPlannerWithConflicts = updateConflictsState(new_planner);

		setStudyPlanner(prev =>
			updateStudentStudyPlanner(prev, () => updatedPlannerWithConflicts)
		);
	}

	const handleAddUnit = () => {
		const new_planner = studentStudyPlanner.StudyPlanner.AddNewUnitRowIntoSemester(yearNumber, semesterIndex, false);

		// Update conflicts and set the planner state
		const updatedPlannerWithConflicts = updateConflictsState(new_planner);

		setStudyPlanner(prev =>
			updateStudentStudyPlanner(prev, () => updatedPlannerWithConflicts)
		);
	}

	const handleRemoveUnit = (index) => {
		const new_planner = studentStudyPlanner.StudyPlanner.DeleteUnitRowFromSemester(yearNumber, semesterIndex, index);

		if (sem.units[index]) {
			if (sem.units[index].unit_type?._name != "Empty" && sem.units[index].unit_type) {
				if (
					(sem.units[index].unit.code == null || sem.units[index].unit_type?._name.toLowerCase() == "elective")
				) {
					const old_unit_type_id = sem?.units?.[index]?.unit_type?._type_id ?? null;
					studentStudyPlanner.MakeAmendments(
						sem.units[index].unit.code,
						null,
						old_unit_type_id,
						-1,
						yearNumber,
						semesterIndex,
						'deleted',
						sem.sem_type,
						sem.sem_id,
						sem.units[index].unit.unit_id
					)
				}
			} else if (sem.units[index].unit.code != null) {
				studentStudyPlanner.MakeAmendments(
					sem.units[index].unit.code,
					null,
					null,
					-1,
					yearNumber,
					semesterIndex,
					'deleted',
					sem.sem_type,
					sem.sem_id,
					sem.units[index].unit.unit_id
				)
			}
		}

		// Update conflicts and set the planner state
		const updatedPlannerWithConflicts = updateConflictsState(new_planner);

		setStudyPlanner(prev =>
			updateStudentStudyPlanner(prev, () => updatedPlannerWithConflicts)
		);
	}



	const handleUnitTypeChange = (unitIndex, type, isOffered = false) => {
		console.log('🔧 handleUnitTypeChange called with:', {
			yearNumber,
			semesterIndex,
			unitIndex,
			old_type: sem?.units?.[unitIndex]?.unit_type?._name,
			new_type: type._name,
			sem_id: sem.sem_id,
			unit_code: sem.units[unitIndex].unit?.code
		})

		const unit_type_to_set = type._name == "Empty" ? null : type;

		console.log('🎨 Setting unit type:', {
			unitIndex,
			old_type: sem.units[unitIndex].unit_type,
			new_type: unit_type_to_set,
			type_object: type
		});

		const new_planner = studentStudyPlanner.StudyPlanner.EditUnitInUnitRow(yearNumber, semesterIndex, unitIndex, {
			unit_id: sem.units[unitIndex].unit?.unit_id,
			unit_type: unit_type_to_set,
			unit_code: sem.units[unitIndex].unit?.code || null,
			unit_name: sem.units[unitIndex].unit?.name || null,
			unit_cp: sem.units[unitIndex].unit?.credit_points || 0,
			unit_requisites: sem.units[unitIndex].requisites || [],
			is_offered: sem.units[unitIndex].is_offered,
			unit_availability: sem.units[unitIndex].unit?.availability,
			status: sem.units[unitIndex].status || 'planned'
		}, null, false);

		console.log('🎨 After EditUnitInUnitRow, unit type is:',
			new_planner.years.find(y => y.year === yearNumber)
				?.semesters[semesterIndex]
				?.units[unitIndex]
				?.unit_type
		);

		const old_unit_type_id = sem?.units?.[unitIndex]?.unit_type?._type_id ?? null;
		if (old_unit_type_id != type._type_id) {
			const unit = sem.units[unitIndex];
			const unitId = unit.unit?.unit_id || unit.unit?.ID || null;

			console.log('🔍 Checking unit ID paths:', {
				'unit.unit?.unit_id': unit.unit?.unit_id,
				'unit.unit?.ID': unit.unit?.ID,
				'unit.unit_id': unit.unit_id,
				'unit.ID': unit.ID,
				'final unitId': unitId,
				'unit.unit full': unit.unit
			});

			console.log('📝 Creating amendment with:', {
				old_unit_code: unit.unit?.code,
				new_unit_code: unit.unit?.code,
				old_unit_id: unitId,
				new_unit_id: unitId,
				old_unit_type_id,
				new_unit_type_id: type._type_id,
				year_index: yearNumber,
				sem_index: semesterIndex,
				sem_type: sem.sem_type,
				sem_id: sem.sem_id
			})

			studentStudyPlanner.MakeAmendments(
				unit.unit?.code,
				unit.unit?.code,
				old_unit_type_id,
				type._type_id,
				yearNumber,
				semesterIndex,
				'changed_type',
				sem.sem_type,
				sem.sem_id,
				unitId,
				unitId,
			)
		}

		// Update conflicts and set the planner state
		const updatedPlannerWithConflicts = updateConflictsState(new_planner);

		setStudyPlanner(prev =>
			updateStudentStudyPlanner(prev, () => updatedPlannerWithConflicts)
		);
	}
	return (
		<>
			<div className="w-full overflow-x-auto over">
				<table className="w-full border-collapse border border-gray-300">
					<thead>
						<tr>
							{!isReadOnly && (
								<th className="border text-left border-gray-500 p-2 w-[7%] bg-gray-300">Unit Type</th>
							)}
							<th className="border text-left border-gray-500 p-2 w-[50%] bg-gray-300">Unit</th>
							<th className="border text-left border-gray-500 p-2 w-[20%] bg-gray-300">Requisites</th>
							<th className="border text-left border-gray-500 p-2 w-[10%] bg-gray-300">CP</th>
							{!isComplete && !isReadOnly && (
								<th className="border text-left border-gray-500 p-2  bg-gray-300">Action</th>
							)}
							<th className="border text-left border-gray-500 p-2 w-[20%] bg-gray-300">Status</th>
						</tr>
					</thead>
					<tbody className='text-sm'>
						{sem.units.map((unit, index) => {
							const isPublished = unit.unit.availability == 'published';
							const conflict = (unit.has_conflict || !unit.is_offered || !isPublished);
							const borderColor = conflict ? 'border border-red-700 border-7' : 'border border-gray-500 ';
							return (
								<tr
									key={index}
									style={{ backgroundColor: unit.unit_type?._color || 'transparent' }}
									className={!unit.unit_type?._color && isDarkMode ? 'text-white' : ''}
									id={`${yearNumber}_${semesterIndex}_${index}`}
								>
									{!isReadOnly && (
										<td className={`${borderColor} p-2 text-center`}>
											<UnitTypeDropdown
												unit={unit}
												unitIndex={index}
												onTypeChange={handleUnitTypeChange}
												unitTypes={unitTypes}
												available={!isComplete}
											/>
										</td>
									)}
									<td
										className={`${borderColor} p-2 ${isComplete || isReadOnly ? 'cursor-default' : 'cursor-pointer'
											}`}
										onClick={!isComplete && !isReadOnly ? () => handleUnitForm(unit, index) : undefined}
									>
										{(unit.unit?.code || unit.unit_type?._name === "Elective") ? (
											<>
												{unit.unit.code ? `${unit.unit.code} - ` : ''}{unit.unit.name}
												{!isComplete && (
													!isPublished ? (
														<span className="text-red-500 ml-2">Unit is {unit.unit.availability}</span>
													) : (
														<>
															{unit.has_conflict && (
																<span className="text-red-500 ml-2">Does not meet requisites</span>
															)}
															{!unit.is_offered && (
																<span className="text-red-500 ml-2">Not offered in Term: {sem.sem_term}</span>
															)}
														</>
													)
												)}
											</>
										) : (
											<>
												Empty
												{!isReadOnly && (
													<span className="text-gray-500"> | Click to select unit</span>
												)}
											</>
										)}
									</td>
									<td className={`${borderColor} p-2 text-center align-center`}>
										<UnitRequisitesDisplay unit={unit} />
									</td>
									<td className={`${borderColor} p-2 text-center align-center`}>
										{unit.unit?.credit_points ? (
											<>
												{unit.unit.credit_points}
											</>
										) : (
											<>0</>
										)}
									</td>
									{!isComplete && !isReadOnly && (
										<td className={`${borderColor} p-2 text-center align-center`}>
											<div className="flex justify-center gap-2">
												<button
													onClick={() => handleUnitForm(unit, index)}
													className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 cursor-pointer" title="Clear Row"
												>
													Select Unit
												</button>
												<button
													onClick={() => handleRemoveUnit(index)}
													className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 cursor-pointer" title="Delete Row"
												>
													Delete
												</button>
											</div>
										</td>
									)}
									<td
										className={`border p-2 text-center align-center ${unit.status === 'pass'
											? 'border-green-500 bg-green-100'
											: unit.status === 'fail'
												? 'border-red-500 bg-red-100'
												: 'border-yellow-500 bg-yellow-100'
											}`}
									>
										{unit.status && (
											<span
												className={
													unit.status === 'pass'
														? 'text-green-500'
														: unit.status === 'fail'
															? 'text-red-500'
															: 'text-yellow-500'
												}
											>
												{unit.status.charAt(0).toUpperCase() + unit.status.slice(1)}
											</span>
										)}
									</td>
								</tr>
							)
						})}
						{!isComplete && !isReadOnly && (
							<tr>
								<td onClick={handleAddUnit} className="cursor-pointer border-gray-500 bg-gray-600 p-2 text-center hover:bg-red-400" title="Add Unit" colSpan={6}>
									<button className="font-bold text-white cursor-pointer" title="Add Unit">Add Unit ➕</button>
								</td>
							</tr>
						)}

					</tbody>
				</table>
				{openUnitForm && (
					<div className="fixed inset-0 z-50 flex justify-center items-center">
						<UnitListing
							onClose={() => setOpenUnitForm(false)}
							term={sem.sem_term}
							onUnitSelect={onUnitSelect}
							selectedUnitIndex={selectedUnitIndex}
							planner={studentStudyPlanner.StudyPlanner}
							currentUnit={sem.units[selectedUnitIndex]}
							yearNumber={yearNumber}
							semesterIndex={semesterIndex}
							master_mode={false}
							is_suggesting={true}
						/>
					</div>
				)}
			</div>
		</>
	)
}

export default Semester