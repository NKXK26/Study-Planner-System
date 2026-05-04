export const GetMonthName = (month_num) => {
	const monthNames = [
		"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December"
	];
	return monthNames[month_num - 1] || "Invalid";
};

export const groupIntakesByStatusAndYear = (intakes) => {
	const modifiedIds = new Set(intakes.Modified.map(item => item._id));
	const deletedIds = new Set(intakes.Deleted.map(item => item._id));

	const existingFiltered = intakes.Existing.filter(item =>
		!modifiedIds.has(item._id) && !deletedIds.has(item._id)
	);

	const activeIntakes = [
		...existingFiltered,
		...intakes.Added,
		...intakes.Modified
	];

	const grouped = {};

	activeIntakes.forEach(intake => {
		const status = intake.status;
		const year = intake._year;

		if (!grouped[status]) {
			grouped[status] = {};
		}
		if (!grouped[status][year]) {
			grouped[status][year] = [];
		}

		grouped[status][year].push(intake);
	});

	return grouped;
};

export const getIntakeBackgroundColor = (intake) => {
	if (intake.is_new) {
		return 'bg-green-100';
	} else if (intake.is_modified) {
		return 'bg-yellow-100';
	} else if (intake.is_existing) {
		return 'bg-white';
	}
	return 'bg-white';
};

export const computeIntakesAfterDelete = (intakes, intake) => {
	if (!intake) return intakes;
  
	if (intake.is_new) {
	  // If it's a newly added intake, just remove it from Added
	  return {
		...intakes,
		Added: intakes.Added.filter(item => item._term_id !== intake._term_id)
	  };
	} else if (intake.is_existing) {
	  // If it was originally existing, move it to Deleted and Existing, and remove from Modified
	  const data = {
		...intakes,
		Deleted: [...intakes.Deleted, intake],
		Existing: [...intakes.Existing, intake],  // Move back to Existing
		Modified: intakes.Modified.filter(item => item._id !== intake._id) // Remove from Modified
	  };
	  return data;
	}
  
	return intakes;
  };

export const computeIntakesAfterEditStatus = (intakes, intake, newStatus) => {
	if (intake.status === newStatus) return intakes;
	if (intake.is_new) {
		return {
			...intakes,
			Added: intakes.Added.map(item =>
				item._id === intake._id ? { ...item, status: newStatus } : item
			)
		};
	} else if (intake.is_existing) {
		const modifiedIntake = { ...intake, status: newStatus, is_modified: true };
		const modifiedWithoutIntake = intakes.Modified.filter(item => item._id !== intake._id);
		const existingWithoutIntake = intakes.Existing.filter(item => item._id !== intake._id);
		return {
			...intakes,
			Existing: existingWithoutIntake,
			Modified: [...modifiedWithoutIntake, modifiedIntake]
		};
	}
	return intakes;
};

export const createNewIntake = (selectedTerm) => ({
	_term_id: selectedTerm._id,
	_name: selectedTerm._name,
	_month: selectedTerm._month,
	_year: selectedTerm._year || new Date().getFullYear(),
	_sem_type: selectedTerm._semtype,
	status: "Unpublished",
	is_new: true
});

export const updateIntakesAfterAdd = (prevIntakes, newIntake) => ({
	...prevIntakes,
	Added: [...prevIntakes.Added, newIntake]
});

export const checkForChanges = (intakes, newMajorName, originalMajorName) => {
	const hasAddedChanges = intakes.Added.length > 0;
	const hasDeletedChanges = intakes.Deleted.length > 0;
	const hasModifiedChanges = intakes.Modified.length > 0;
	const hasMajorNameChanges = newMajorName !== null && newMajorName !== undefined && newMajorName !== originalMajorName;
	return hasAddedChanges || hasDeletedChanges || hasModifiedChanges || hasMajorNameChanges;
};

export const prepareChangesData = (intakes, majorId) => ({
	added: intakes.Added.map(item => {
		return {
			major_id: majorId,
			term_id: item._term_id,
			status: item.status.toLowerCase(),
			sem_type: item._sem_type
		};
	}),
	deleted: intakes.Deleted
		.filter(item => item._id !== null)
		.map(item => item._id),
	modified: intakes.Modified
});

export const updateIntakesAfterSave = (intakes) => {
	const updatedExisting = [
		...intakes.Existing.filter(item => !intakes.Deleted.some(del => del._id === item._id)),
		...intakes.Added.map(item => ({ ...item, is_new: false, is_existing: true })),
		...intakes.Modified.map(item => ({ ...item, is_modified: false, is_existing: true }))
	];

	return {
		Added: [],
		Deleted: [],
		Modified: [],
		Existing: updatedExisting
	};
};

export const resetIntakes = (originalIntakes) => ({
	Added: [],
	Deleted: [],
	Modified: [],
	Existing: originalIntakes || []
});