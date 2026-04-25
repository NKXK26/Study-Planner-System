'use client'

import React, { useEffect, useState } from 'react';
import UnitDB from '@app/class/Unit/UnitDB';

const UnitOptionListing = ({ unit_code, selected_unit_code, onSelect, allUnits = [] }) => {
	const [options, setOptions] = useState([]);
	const [errorMessage, setErrorMessage] = useState('');

	useEffect(() => {
		const fetchUnits = async () => {
			// Reset state first
			setOptions([]);
			setErrorMessage('');

			const trimmedInput = unit_code.trim();
			if (!trimmedInput) return;

			if (allUnits.length < 0) {
				setErrorMessage('Invalid Unit Code');
				return;
			}

			const lowerSearch = trimmedInput.toLowerCase();
			setOptions(allUnits
				.filter(unit =>
					unit._unit_code.toLowerCase().includes(lowerSearch) ||
					unit._name.toLowerCase().includes(lowerSearch)
				)
				.map(unit => ({
					id: unit.id,
					unit_code: unit._unit_code,
					name: unit._name
				}))
			);
		};

		if (unit_code.trim()) {
			fetchUnits();
		}
	}, [unit_code, selected_unit_code]);

	if (errorMessage) {
		return (
			<div className="w-full bg-white border border-red-400 text-red-600 shadow-md px-4 py-2 text-sm">
				{errorMessage}
			</div>
		);
	}

	if (options.length === 0) return (
		<div className="w-full bg-white border border-red-400 text-red-600 shadow-md px-4 py-2 text-sm">
			Unit Not Found
		</div>
	)

	return (
		<div className="w-full border shadow-md max-h-32 overflow-auto">
			{options.map((unit, index) => (
				<div
					key={index}
					onClick={() => onSelect(unit)}
					className="px-4 py-2 hover:bg-gray-200 cursor-pointer text-sm"
				>
					{unit.unit_code} - {unit.name}
				</div>
			))}
		</div>
	);
};

export default UnitOptionListing;
