import React, { useEffect, useState } from 'react'
import UnitTypeDropdown from './unit_type_dropdown'
import UnitListing from './unit_listing'
import UnitRequisitesDisplay from '@app/view/unit/unit_requisite_display'
import ConfirmPopup from '@components/confirm';

const Semester = ({ sem, yearNumber, semesterIndex, planner, setStudyPlanner, handleRemoveSemester, unitTypes, studentMode = false, is_read_only }) => {
	const [openUnitForm, setOpenUnitForm] = useState(false)
	const [selectedUnitIndex, setSelectedUnitIndex] = useState(null)
	const [confirmPopup, setConfirmPopup] = useState(null)

	const handleUnitForm = (unit, unitIndex) => {
		setOpenUnitForm(true)
		setSelectedUnitIndex(unitIndex)
	}

	const handleAddUnit = () => {
		const new_planner = planner.AddNewUnitRowIntoSemester(yearNumber, semesterIndex)
		setStudyPlanner(new_planner)
	}

	const handleRemoveUnit = (index) => {
		const new_planner = planner.DeleteUnitRowFromSemester(yearNumber, semesterIndex, index)
		setStudyPlanner(new_planner)
	}

	const handleUnitTypeChange = (unitIndex, type, isOffered = false) => {
		const new_planner = planner.EditUnitInUnitRow(yearNumber, semesterIndex, unitIndex, {
			unit_id: sem.units[unitIndex].unit?.unit_id || null,
			unit_type: type._name == "Empty" ? null : type,
			unit_code: sem.units[unitIndex].unit?.code || null,
			unit_name: sem.units[unitIndex].unit?.name || null,
			unit_cp: sem.units[unitIndex].unit?.credit_points || 0,
			unit_requisites: sem.units[unitIndex].requisites || [],
			is_offered: sem.units[unitIndex].is_offered,
			unit_availability: sem.units[unitIndex].unit?.availability
		})
		setStudyPlanner(new_planner)
	}

	const onUnitSelect = async (unit, unitIndex, existingUnitPosition, isOffered = true) => {
		try {
			if (existingUnitPosition) {
				// If unit exists in planner, swap positions
				const new_planner = planner.SwapUnits(
					existingUnitPosition.year,
					existingUnitPosition.semesterIndex,
					existingUnitPosition.unitIndex,
					yearNumber,
					semesterIndex,
					unitIndex
				);
				setStudyPlanner(new_planner);
			} else {
				// If unit is new, just add it
				const new_planner = planner.EditUnitInUnitRow(yearNumber, semesterIndex, unitIndex, {
					unit_id: unit._id,
					unit_code: unit._unit_code,
					unit_name: unit._name,
					unit_cp: unit._credit_points,
					unit_requisites: unit._requisites,
					unit_type: sem.units[unitIndex].unit_type,
					is_offered: isOffered,
					unit_availability: unit._availability
				})
				setStudyPlanner(new_planner)
			}
		} catch (error) {
			console.error('Error in onUnitSelect:', error);
		}
	}

	const clearUnitRow = (index) => {
		const new_planner = planner.EditUnitInUnitRow(yearNumber, semesterIndex, index, {
			unit_type: null,
			unit_code: null,
			unit_name: null,
			unit_availability: null,
			unit_cp: 0,
			unit_requisites: [],
			has_conflict: false,
		});
		setStudyPlanner(new_planner);
	}

	return (
		<div className="relative">
			<div className="flex justify-between items-center mb-1">
				<h3 className="w-full bg-gray-800 text-white font-bold py-2 px-4 rounded-t ">{sem.sem_name} | {sem.intake.month} {sem.intake.year}</h3>
				{!is_read_only && !(yearNumber === 1 && semesterIndex === 0) && (
					<button
						className="w-12 h-12 flex items-center justify-center rounded-full bg-white hover:bg-red-500 text-2xl text-white cursor-pointer"
						title="Remove Semester"
						onClick={async () => {
							try {
								await handleRemoveSemester(semesterIndex);
							} catch (error) {
								console.error('Error removing semester:', error);
							}
						}}
					>
						🗑️
					</button>
				)}
			</div>
			<div className="w-full overflow-x-auto over">
				<table className="w-full border-collapse border border-gray-300">
					<thead>
						<tr>
							{!is_read_only && (
								<th className="border text-left border-gray-500 p-2 w-[7%] bg-gray-300">Unit Type</th>
							)}
							<th className="border text-left border-gray-500 p-2 bg-gray-300">Unit</th>
							<th className="border text-left border-gray-500 p-2 w-[20%] bg-gray-300">Requisites</th>
							<th className="border text-left border-gray-500 p-2 w-[20%] bg-gray-300">Credit Points</th>
							{!is_read_only && (
								<th className="border text-left border-gray-500 p-2 w-[20%] bg-gray-300">Action</th>
							)}
						</tr>
					</thead>
					<tbody>
						{sem.units.map((unit, index) => {
							const conflict = (unit.has_conflict || !unit.is_offered);
							const borderColor = conflict ? 'border border-red-700 border-7' : 'border border-gray-500 ';
							return (
								<tr key={index} style={{ backgroundColor: unit.unit_type?._color || 'transparent' }} id={`${yearNumber}_${semesterIndex}_${index}`}>
									{!is_read_only && (
										<td className={`p-2 text-center ${borderColor}`}>
											<UnitTypeDropdown
												unit={unit}
												unitIndex={index}
												onTypeChange={handleUnitTypeChange}
												unitTypes={unitTypes}
											/>
										</td>
									)}

									<td
										className={`p-2 ${borderColor} ${!is_read_only ? 'cursor-pointer' : ''}`}
										onClick={!is_read_only ? () => handleUnitForm(unit, index) : undefined}
									>
										{unit.unit?.code || unit.unit_type?._name === "Elective" ? (
											<>
												{unit.unit.code ? `${unit.unit.code} - ` : ''}{unit.unit.name}
												{unit.has_conflict && (
													<span className="text-red-500 ml-2">Does not meet requisites</span>
												)}
												{!unit.is_offered && (
													<span className="text-red-500 ml-2">Not offered in Term: {sem.sem_term}</span>
												)}
											</>
										) : (
											<>
												<span className="listing-studyplanner">
													Empty
													{!is_read_only && <span className="listing-studyplanner"> | Click to select unit</span>}
												</span>
											</>
										)}
									</td>
									<td className={`p-2 text-center align-top ${borderColor}`}>
										<UnitRequisitesDisplay unit={unit} />
									</td>
									<td className={`p-2 text-center align-center ${borderColor}`}>
										{unit.unit?.credit_points}
									</td>
									{!is_read_only && (
										<td className={`p-2 text-center ${borderColor}`}>
											<div className="flex justify-center gap-2">
												<button
													onClick={() => handleUnitForm(unit, index)}
													className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 cursor-pointer" title="Clear Row"
												>
													Select Unit
												</button>
												<button
													onClick={() => clearUnitRow(index)}
													className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 cursor-pointer" title="Clear Row"
												>
													Clear Row
												</button>
												<button
													onClick={() => handleRemoveUnit(index)}
													className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 cursor-pointer" title="Delete Row"
												>
													Delete Row
												</button>
											</div>
										</td>
									)}
								</tr>
							)
						})}
						{!is_read_only && (
							<tr>
								<td onClick={handleAddUnit} className="cursor-pointer border-gray-500 bg-gray-600 p-2 text-center hover:bg-red-400" title="Add Unit" colSpan={5}>
									<button className="font-bold text-white cursor-pointer" title="Add Unit">Add Unit ➕</button>
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
			{openUnitForm && (
				<div className="fixed inset-0 z-50 flex justify-center items-center">
					<UnitListing
						onClose={() => setOpenUnitForm(false)}
						term={sem.sem_term}
						onUnitSelect={onUnitSelect}
						selectedUnitIndex={selectedUnitIndex}
						planner={planner}
						currentUnit={sem.units[selectedUnitIndex]}
						yearNumber={yearNumber}
						semesterIndex={semesterIndex}
					/>
				</div>
			)}
			{confirmPopup && (
				<ConfirmPopup
					title={confirmPopup.title}
					description={confirmPopup.message}
					isOpen={confirmPopup.show}
					onClose={() => setConfirmPopup({ show: false })}
					onConfirm={() => {
						confirmPopup.onConfirm();
						setConfirmPopup({ show: false });
					}}
					confirmButtonColor="red"
				/>
			)}
		</div>
	)
}

export default Semester