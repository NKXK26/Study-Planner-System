import React from 'react'

const UnitRequisitesDisplay = ({ unit }) => {
	const requisites = unit.requisites? unit.requisites : unit._requisites; 
	console.log('unit w req', unit)
	if (!requisites || requisites.length === 0) {
		return <span className="text-gray-400">None</span>;
	}

	// Process the requisites into groups
	const processed_requisites = [];
	let current_group = [requisites[0]];

	for (let i = 1; i < requisites.length; i++) {
		const current_req = requisites[i];
		const previous_req = requisites[i - 1];

		if (previous_req._operator === "or") {
			// If previous requisite connects with OR, add to current group
			current_group.push(current_req);
		} else {
			// If previous requisite connects with AND, start a new group
			processed_requisites.push({
				items: current_group,
				nextOperator: previous_req._operator
			});
			current_group = [current_req];
		}
	}

	// Add the last group
	if (current_group.length > 0) {
		processed_requisites.push({
			items: current_group,
			nextOperator: requisites.length > 1 ?
				requisites[requisites.length - 1]._operator : null
		});
	}

	return (
		<div className="space-y-2">
			{processed_requisites.map((group, groupIndex) => (
				<div key={`group-${groupIndex}`} className="flex flex-col items-start">
					{/* Between-group operator */}
					{groupIndex > 0 && (
						<div className="py-1 px-2 text-xs font-bold text-gray-500">
							{processed_requisites[groupIndex - 1].nextOperator.toUpperCase()}
						</div>
					)}

					{/* Group with parentheses */}
					<div className="border border-gray-200 rounded-lg p-2 bg-gray-50 w-full">
						{/* Items within group */}
						{group.items.map((req, reqIndex) => (
							<div key={req._id || reqIndex} className="text-sm">
								{req._minCP !== null ? (
									<span className="text-gray-700">
										Min CP: <span className="font-medium">{req._minCP}</span>
									</span>
								) : (
									<span className="text-gray-700">
										<span className="font-medium">
											{req._unit_relationship === 'pre' ? 'Pre' :
												req._unit_relationship === 'co' ? 'Co' :
													req._unit_relationship.charAt(0).toUpperCase() + req._unit_relationship.slice(1)}
										</span>: {req._requisite_unit_code}
									</span>
								)}
								{reqIndex < group.items.length - 1 && (
									<div className="text-xs font-medium text-gray-500 my-1">
										OR
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

export default UnitRequisitesDisplay;