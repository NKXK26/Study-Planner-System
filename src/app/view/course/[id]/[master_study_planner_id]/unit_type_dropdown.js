import React, { useState, useEffect, useRef } from 'react'
import UnitTypeDB from '@app/class/UnitType/UnitTypeDB'

const UnitTypeDropdown = ({ unit, unitIndex, onTypeChange, unitTypes, available = true }) => {
	const [isOpen, setIsOpen] = useState(false)
	const [searchTerm, setSearchTerm] = useState('')
	const [availableTypes, setAvailableTypes] = useState([
		{ _name: "Empty", _color: "#CCCCCC" },
	])
	const searchUnitTypeRef = useRef(null);
	const [highlightedIndex, setHighlightedIndex] = useState(0)

	useEffect(() => {
		if (isOpen && searchUnitTypeRef.current) {
			searchUnitTypeRef.current.focus()
			setHighlightedIndex(0) // reset highlight each time dropdown opens
		}
	}, [isOpen])

	const dropdownRef = useRef(null)

	useEffect(() => {
		if (unitTypes) {
			setAvailableTypes([{ _name: "Empty", _color: "#CCCCCC" }, ...unitTypes])
		}
	}, [unitTypes])

	const filteredTypes = availableTypes.filter(type =>
		type._name.toLowerCase().includes(searchTerm.toLowerCase())
	)

	const selectedType = availableTypes.find(type =>
		unit.unit_type === null ? type._name === "Empty" : type._name === unit.unit_type._name
	)

	// Detect clicks outside
	useEffect(() => {
		const handleClickOutside = (event) => {
			setSearchTerm("")
			// Check if click is on the confirmation dialog
			const confirmDialog = document.querySelector('.swal2-container');
			if (confirmDialog && confirmDialog.contains(event.target)) {
				return;
			}

			if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
				setIsOpen(false)
			}
		}

		document.addEventListener('mousedown', handleClickOutside)
		return () => {
			document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [])

	return (
		<>

			<div
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-2 justify-center cursor-pointer relative"
				ref={dropdownRef}
			>
				<div
					className="w-5 h-5 rounded-full border-2 border-gray-400" title="Unit Type"
					style={{ backgroundColor: selectedType?._color || '#ccc' }}
				/>
			</div>
			<div ref={dropdownRef} className="absolute text-black">
				{isOpen && (
					<div className="absolute top-full left-0 bg-white border border-gray-300 overflow-auto max-height-[200px] rounded-lg p-2 z-50 w-48" style={{ minWidth: '12rem' }}>
						<input
							ref={searchUnitTypeRef}
							type="text"
							placeholder="Search unit types..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && filteredTypes.length > 0) {
									e.preventDefault();
									const firstType = filteredTypes[0];
									setSearchTerm("");
									onTypeChange(unitIndex, firstType);
									setIsOpen(false);
								}
							}}
							className="w-full p-1 mb-2 border border-gray-300 rounded"
						/>
						<div className="max-h-[100px] overflow-y-auto text-black">
							{filteredTypes.map((type, index) => (
								<div
									key={type._name}
									onClick={() => {
										setSearchTerm("")
										onTypeChange(unitIndex, type)
										setIsOpen(false)
									}}
									className={`flex items-center gap-2 p-2 cursor-pointer rounded hover:bg-gray-100 `}
								>
									<div
										className="w-5 h-5 rounded-full border-2 border-gray-400"
										style={{ backgroundColor: type._color }}
									/>
									<span className="text-sm">{type._name}</span>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</>
	)
}

export default UnitTypeDropdown
