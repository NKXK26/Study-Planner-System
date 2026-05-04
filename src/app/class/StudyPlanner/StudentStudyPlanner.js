import StudyPlanner from "./StudyPlanner";
import StudentDB from "../Student/StudentsDB";
import UnitDB from "../Unit/UnitDB";
import UnitTermOfferedDB from "../UnitTermOffered/UnitTermOfferedDB";
import UnitTypeDB from "../UnitType/UnitTypeDB";
import StudentStudyPlannerAmmendmentsDB from "../StudentStudyPlannerAmmendments/StudentStudyPlannerAmmendmentsDB";

let unit_term_offered_arr = []
let unit_type_info = []
//Fetch the Unit Term Offered DB once, to be used throughout the class
async function FetchInfo() {
	const unitTermOffered = await UnitTermOfferedDB.FetchTermOffered({})
	if (unitTermOffered.data) {
		if (unitTermOffered.data.length > 0) {
			unit_term_offered_arr = unitTermOffered.data;
		}
	}

	const unitType = await UnitTypeDB.FetchUnitTypes({});
	unit_type_info = unitType.data;
}
// Avoid running during SSR since this relies on client-only session/headers
if (typeof window !== 'undefined') {
	FetchInfo();
}

class StudentStudyPlanner {
	constructor() {
		this.study_planner = new StudyPlanner();
		this.required_cp = 0;
		this.student_info = {
			student_id: "",
			name: "",
			status: "",
			credits_completed: 0,
			mpu_credits_completed: 0,
			course_id: 0,
			major_id: 0,
			intake_id: 0,
		};
		this.unit_history = [];
		this.completed_units = [];
		this.uncompleted_units = [];
		this.amendments = [];
		this.amendments_history = [];
	}

	/**
	 * Initialize the student study planner
	 * @param {string} student_id - The student ID
	 * @param {number} planner_id - The planner ID
	 * @returns {StudentStudyPlanner} - The initialized student study planner
	 */
	async Init(student_id, planner_id) {
		// Initialize the master study planner and get all units
		const result = await InitializeMasterPlanner(planner_id, false);
		if (result.status == false) {
			return result;
		}
		const master_study_planner = result.data;
		if (master_study_planner.details.status != 'Complete') {
			return { status: false, message: 'Study Planner is not complete' };
		}
		const all_units = master_study_planner.GetAllUnits();
		// Fetch student information and unit history
		const { student_info, unit_history, amendments } = await FetchStudentData(student_id);
		if (!student_info) {
			return { status: false, message: 'Student ID not found' };
		}
		this.required_cp = master_study_planner.creditsRequired;

		// Set student info
		this.student_info = {
			student_id: student_info._studentID,
			name: student_info._FirstName,
			status: student_info._status,
			credits_completed: student_info._creditCompleted,
			mpu_credits_completed: student_info._mpuCreditCompleted || 0,
			course_id: student_info._courseID,
			major_id: student_info._majorID,
			intake_id: student_info._intakeID,
		};
		// Process units into completed and uncompleted
		await this.ProcessUnits(all_units, unit_history);
		const years = master_study_planner.GetAllYearsAndSemesters();

		// Group completed units by year and term
		const processed_completed_units = GroupCompletedUnits(this.completed_units);

		// Add completed units first into the years
		let last_sem_fail_unit_count = 0
		last_sem_fail_unit_count = AddCompletedUnitIntoYears(processed_completed_units, years, last_sem_fail_unit_count);

		//Dynamically Add the uncompleted units into the years, it should be based on the current date
		AddUncompletedUnitIntoYears(this.uncompleted_units, years, last_sem_fail_unit_count);

		this.amendments_history = amendments;
		if (this.amendments_history.length > 0) {
			await ApplyAmendments(this.amendments_history, years, this.student_info.credits_completed, this.required_cp)
		}

		//Add data into the study planner
		this.study_planner.InitDetails(master_study_planner.courseName,
			master_study_planner.courseCode,
			master_study_planner.creditsRequired,
			master_study_planner.majorName,
			master_study_planner.majorID,
			master_study_planner.intakeName,
			master_study_planner.intakeMonth,
			master_study_planner.intakeYear,
			master_study_planner.intakeSemType
		);

		//Add the processed and clean data into the study planner
		this.study_planner = AddYearDataIntoPlanner(years, this.study_planner)

		this.study_planner = this.study_planner.CleanStudyPlanner(false);

		return this;
	}

	/**
	 * Process units into completed and uncompleted categories
	 * @param {Array} all_units - All units from the master planner
	 * @param {Array} unit_history - The student's unit history
	 */
	//TODO: Might got to update here
	async ProcessUnits(all_units, unit_history) {
		this.completed_units = [];
		this.uncompleted_units = [...all_units];

		// Sort unit_history by Year and Month before processing
		const sortedUnitHistory = [...unit_history].sort((a, b) => {
			// First compare by year
			if (a.Year !== b.Year) {
				return a.Year - b.Year;
			}
			// If same year, compare by term's year
			if (a.Term.Year !== b.Term.Year) {
				return a.Term.Year - b.Term.Year;
			}
			// If same year and term year, compare by term's month
			return a.Term.Month - b.Term.Month;
		});

		// Process sorted unit history
		// Batch-fetch unit info for all history unit codes to avoid per-item calls
		let unit_history_codes = {};
		try {
			const historyUnitCodes = Array.from(new Set(sortedUnitHistory
				.filter(h => h?.Unit?.UnitCode && !h.Unit.UnitCode.startsWith('MPU'))
				.map(h => h.Unit.UnitCode)));
			if (historyUnitCodes.length > 0) {
				const batchedUnitsRes = await UnitDB.FetchUnits({ code: historyUnitCodes });
				const fetchedUnits = batchedUnitsRes?.data || [];
				unit_history_codes = fetchedUnits.reduce((acc, u) => {
					if (u?.unit_code) acc[u.unit_code.toLowerCase()] = u;
					return acc;
				}, {});
			}
		} catch (e) {
			console.error('Batch fetch for history unit codes failed:', e);
		}

		for (const historyUnit of sortedUnitHistory) {
			const matchingUnitIndex = this.uncompleted_units.findIndex(masterUnit =>
				masterUnit.unit &&
				masterUnit.unit.code &&
				historyUnit.Unit &&
				historyUnit.Unit.UnitCode &&
				masterUnit.unit.code.toLowerCase() === historyUnit.Unit.UnitCode.toLowerCase()
			);

			if (matchingUnitIndex !== -1) {
				// Case 1: Unit found in master plan
				const completedUnit = this.uncompleted_units[matchingUnitIndex];

				// Add to completed_units regardless of status
				this.completed_units.push({
					...completedUnit,
					term: historyUnit.Term,
					year: historyUnit.Year,
					status: historyUnit.Status
				});


				// Only remove from uncompleted_units if status is "pass"
				// Keep it in uncompleted_units if status is "fail"
				if (historyUnit.Status.toLowerCase() !== "fail") {
					this.uncompleted_units.splice(matchingUnitIndex, 1);
				}
			} else {
				if (historyUnit.Unit.UnitCode.startsWith('MPU')) {
					const unitType = GetUnitTypeByName("MPU");
					const completedUnit = {
						unit_type: unitType,
						unit: {
							unit_id: historyUnit.Unit.ID || historyUnit.UnitID || null,
							code: historyUnit.Unit.UnitCode || null,
							name: historyUnit.Unit.Name || "External Unit",
							credit_points: historyUnit.Unit.CreditPoints ?? 12.5,
							availability: historyUnit.Unit.Availability || null
						},
						requisites: historyUnit.Unit.UnitRequisiteRelationship_UnitRequisiteRelationship_UnitCodeToUnit || [],
						term: historyUnit.Term,
						year: historyUnit.Year,
						status: historyUnit.Status,
						has_conflict: false,
						is_offered: true,
					};
					this.completed_units.push(completedUnit);
					continue;
				}
				// Case 2: Unit not found in master plan

				// Find an elective unit to replace
				const electiveIndex = this.uncompleted_units.findIndex(unit =>
					unit.unit &&
					(unit.unit.code === null || unit.unit.code === "") &&
					unit.unit_type &&
					unit.unit_type._name.toLowerCase().includes('elective')
				);

				if (electiveIndex !== -1 && historyUnit.Status.toLowerCase() === "pass") {
					// Use an elective slot for this completed unit
					const electiveUnit = this.uncompleted_units[electiveIndex];

					// Lookup unit info from batched results
					const lookupCode = historyUnit.Unit.UnitCode?.toLowerCase();
					const unit_info = lookupCode ? unit_history_codes[lookupCode] || null : null;

					if (unit_info) {
						const completedUnit = {
							...electiveUnit,
							unit: {
								unit_id: unit_info.id || historyUnit.Unit.ID || historyUnit.UnitID || null,
								code: unit_info.unit_code || null,
								name: unit_info.name || "External Unit",
								credit_points: unit_info.credit_points ?? 12.5,
								availability: 'published'
							},
							requisites: unit_info.requisites || [],
							term: historyUnit.Term,
							year: historyUnit.Year,
							status: historyUnit.Status
						};
						this.completed_units.push(completedUnit);
					} else {
						// Fallback if not found in batched results
						const completedUnit = {
							...electiveUnit,
							unit: {
								unit_id: historyUnit.Unit.ID || historyUnit.UnitID || null,
								code: historyUnit.Unit.UnitCode || null,
								name: historyUnit.Unit.Name || "External Unit",
								credit_points: historyUnit.Unit.CreditPoints ?? 12.5,
								availability: historyUnit.Unit.Availability || null
							},
							requisites: [],
							term: historyUnit.Term,
							year: historyUnit.Year,
							status: historyUnit.Status
						};
						this.completed_units.push(completedUnit);
					}

					// Remove the elective from uncompleted units if status is "pass"
					if (historyUnit.Status.toLowerCase() === "pass") {
						this.uncompleted_units.splice(electiveIndex, 1);
					}
				} else {
					// // Find an elective to borrow the unit_type from
					// const anyElective = this.uncompleted_units.find(unit =>
					// 	unit.unit_type && unit.unit_type._name.toLowerCase().includes("elective")
					// );
					const elective_unit_type_info = GetUnitTypeByName("elective");
					const lookupCode = historyUnit.Unit.UnitCode?.toLowerCase();
					const unit_info = lookupCode ? unit_history_codes[lookupCode] || null : null;

					this.completed_units.push({
						unit: {
							unit_id: unit_info?.id || historyUnit.Unit.ID || historyUnit.UnitID || null,
							code: unit_info?.unit_code || historyUnit.Unit.UnitCode || null,
							name: unit_info?.name || historyUnit.Unit.Name || "Unkown Unit",
							credit_points: unit_info?.credit_points ?? historyUnit.Unit.CreditPoints ?? 12.5,
							availability: 'published'
						},
						unit_type: elective_unit_type_info,
						requisites: unit_info?.requisites || [],
						term: historyUnit.Term,
						year: historyUnit.Year,
						status: historyUnit.Status
					});

					// If the unit is passed and not part of the plan, we don't need to modify uncompleted_units
				}
			}
		}
	}

	get StudyPlanner() {
		return this.study_planner;
	}

	set StudyPlanner(newPlanner) {
		this.study_planner = newPlanner;
	}

	get StudentInfo() {
		return this.student_info;
	}

	get CompletedUnits() {
		return this.completed_units;
	}

	get UncompletedUnits() {
		return this.uncompleted_units;
	}

	ClearAmendments() {
		this.amendments = [];
	}

	RemoveYearUnitAmendments(year) {
		for (const amendment of this.amendments) {
			if (amendment.yearIndex > year) {
				amendment.yearIndex--
			}
		}
	}

	RemoveSemesterUnitAmendments(sem, year, semIndex) {
		//TODO UPDATE HERE AS WELL
		for (const unit of sem.units) {
			this.MakeAmendments(unit.unit.code, null, unit.unit_type?._type_id ?? null, -1, year, semIndex, 'deleted', sem.sem_type, sem.sem_id, unit.unit.unit_id, null)
		}

		for (const amendment of this.amendments) {
			if (amendment.yearIndex == year && amendment.semIndex > semIndex) {
				amendment.semIndex--
			}
		}
	}

	//Gotta update this to have unit id and new_unit_id
	MakeAmendments(old_unit_code = null, new_unit_code = null, old_unit_type_id = null, new_unit_type_id = null, year_index = null, sem_index = null, action = 'swapped', sem_type = "Long Semester", sem_id = null, old_unit_id = null, new_unit_id = null) {
		console.log('📋 MakeAmendments received:', {
			old_unit_code,
			new_unit_code,
			old_unit_type_id,
			new_unit_type_id,
			year_index,
			sem_index,
			action,
			sem_type,
			sem_id,
			old_unit_id,
			new_unit_id
		});

		const valid_types = ["changed_type", "deleted", "replaced", "swapped"];

		if (!valid_types.includes(action)) {
			return false;
		}
		const amendment_obj = {
			old_unit_code,
			old_unit_id,
			new_unit_code,
			new_unit_id,
			old_unit_type_id,
			new_unit_type_id,
			year_index,
			sem_index,
			action,
			sem_type,
			sem_id
		};

		// Check if old unit type is elective
		const isOldElective = getUnitTypeInfo(old_unit_type_id)?.name?.toLowerCase() === "elective";

		const alreadyExists = this.amendments.some(a => {
			// Special case: if old unit is elective with null code, use different comparison
			if ((isOldElective || !old_unit_type_id) && old_unit_code === null) {
				console.log('amendment_obj', amendment_obj)
				return false;
			}

			// Regular comparison for other cases
			return a.old_unit_code === amendment_obj.old_unit_code &&
				a.new_unit_code === amendment_obj.new_unit_code &&
				a.old_unit_type_id === amendment_obj.old_unit_type_id &&
				a.new_unit_type_id === amendment_obj.new_unit_type_id &&
				a.year_index === amendment_obj.year_index &&
				a.sem_index === amendment_obj.sem_index &&
				a.sem_type === amendment_obj.sem_type;
		});

		if (!alreadyExists) {
			this.amendments.push(amendment_obj);
		}
	}

	async SaveAmendmentsToDB(amendments) {
		console.log('💾 SaveAmendmentsToDB received amendments:', amendments);

		const amendments_db = amendments.map(amendments => {
			const amendment = {
				student_id: this.student_info.student_id,
				unit_code: amendments.old_unit_code || null,
				unit_id: amendments.old_unit_id || null,
				new_unit_id: amendments.new_unit_id || null,
				new_unit_code: amendments.new_unit_code || null,
				action: amendments.action,
				old_unit_type_id: amendments.old_unit_type_id >= 0 ? amendments.old_unit_type_id : null,
				new_unit_type_id: amendments.new_unit_type_id >= 0 ? amendments.new_unit_type_id : null,
				sem_type: amendments.sem_type
			};

			// Always save year and sem_index for fallback, even when sem_id is available
			amendment.year = amendments.year_index || null;
			amendment.sem_index = amendments.sem_index;

			// Also save sem_id if available
			if (amendments.sem_id) {
				amendment.sem_id = amendments.sem_id;
			}

			console.log('💾 Mapped amendment to DB format:', {
				original_year_index: amendments.year_index,
				original_sem_index: amendments.sem_index,
				original_sem_id: amendments.sem_id,
				mapped_year: amendment.year,
				mapped_sem_index: amendment.sem_index,
				mapped_sem_id: amendment.sem_id
			});

			return amendment;
		});

		let amendments_add_res = await StudentStudyPlannerAmmendmentsDB.AddAmendment(amendments_db);
		if (amendments_add_res.success) {
			this.amendments = [];
			return true;
		} else {
			return false;
		}
	}

	//Returns success: boolean, message: string and study_planner: StudyPlanner
	SolveConflicts() {
		//Clone of unsolved planner
		let unsolved_planner = this.study_planner.Clone();

		// Get all conflicting units in the planner
		let conflicts = unsolved_planner.GetConflictingUnitsIndex(true);
		//All units offered
		let units_offered = unit_term_offered_arr;
		let total_cp = 0;
		let completed_unit_codes = this.CompletedUnits
			.filter(unit => unit.status === "pass")
			.map(unit => {
				total_cp += unit.unit.credit_points;
				return {
					code: unit.unit.code
				};
			});

		// If no conflicts, return success immediately
		if (conflicts.length === 0) {
			return {
				success: true,
				message: 'No conflicts found',
				study_planner: this.study_planner
			};
		}

		// Clean the planner to ensure it's in a valid state
		// unsolved_planner = unsolved_planner.CleanStudyPlanner();

		let max_attempts = 20; // Prevent infinite loops
		let attempts = 0;
		let conflicts_solved = 0;

		// Amendments should only be committed if the planner is fully solvable
		let amendments_collected = [];
		const original_make_amendments = this.MakeAmendments;
		this.MakeAmendments = (...args) => {
			amendments_collected.push(args);
		};

		while (conflicts.length > 0 && attempts < max_attempts) {
			attempts++;
			let new_conflicts = [];

			for (const conflict of conflicts) {
				const { year_num, sem_index, unit_index } = conflict;

				// Get the conflicting unit
				const year = unsolved_planner.years.find(y => y.year === year_num);
				if (!year) continue;

				const semester = year.semesters[sem_index];
				if (!semester) continue;

				const unit = semester.units[unit_index];
				if (!unit) continue;

				// Try to solve this conflict
				const conflict_solved = this.SolveUnitConflict(
					unsolved_planner,
					year_num,
					sem_index,
					unit_index,
					completed_unit_codes,
					units_offered
				);

				if (!conflict_solved) {
					// If we couldn't solve this conflict, keep it for next iteration
					new_conflicts.push(conflict);
				} else {
					conflicts_solved++;
				}

				// Update conflicts list
				conflicts = unsolved_planner.GetConflictingUnitsIndex(true);

			}
		}

		// Check if all conflicts were resolved
		const final_conflicts = unsolved_planner.GetConflictingUnitsIndex(true);
		const success = final_conflicts.length === 0;

		// Restore MakeAmendments
		this.MakeAmendments = original_make_amendments;

		if (success) {
			// Commit all collected amendments
			for (const args of amendments_collected) {
				this.MakeAmendments(...args);
			}
			return {
				success: true,
				message: `Successfully resolved ${conflicts_solved} conflicts`,
				study_planner: unsolved_planner //Return the solved planner
			};
		} else {
			return {
				success: false,
				//TODO(BECK): Provide more details on remaining conflicts
				message: `Failed to resolve all conflicts. ${final_conflicts.length} conflicts remain after ${attempts} attempts`,
				study_planner: this.study_planner // Return original unsolved planner
			};
		}
	}

	/**
	 * Solve a single conflict by finding a suitable swap or move
	 */
	SolveUnitConflict(planner, year_num, sem_index, unit_index, completed_units, units_offered) {
		const year = planner.years.find(y => y.year === year_num);
		if (!year) return false;

		const semester = year.semesters[sem_index];
		if (!semester) return false;

		const unit = semester.units[unit_index];
		if (!unit) return false;

		// Get completed unit codes for prerequisite checking
		const completed_codes = completed_units.map(u => u.code);

		// Check if this unit has any conflicts
		if (unit.has_conflict || !unit.is_offered) {
			// Check what type of conflict this is
			const conflict_type = DetectConflictType(unit, completed_codes, planner, year_num, sem_index, this.completed_units);

			switch (conflict_type) {
				case 'prerequisite':
				case 'corequisite':
				case 'antirequisite':
				case 'min_cp':
					// Use complex solver for all requisite types
					return this.SolveComplexRequisiteConflict(planner, year_num, sem_index, unit_index, completed_codes, units_offered);
				case 'availability':
					return this.SolveAvailabilityConflict(planner, year_num, sem_index, unit_index, units_offered, true);
				default:
					return false;
			}
		}

		return false;
	}


	/**
	 * Solve availability conflicts by moving units to semesters where they are offered
	 */
	SolveAvailabilityConflict(planner, year_num, sem_index, unit_index, units_offered, priortise_later_sems = false) {
		const year = planner.years.find(y => y.year === year_num);
		const semester = year.semesters[sem_index];
		const unit = semester.units[unit_index];

		// Find semesters where this unit is offered
		const offered_terms = units_offered
			.filter(uo => uo._unit_code === unit.unit?.code)
			.map(uo => uo._term_type);

		if (offered_terms.length === 0) {
			return false;
		}

		let best_swap = null; // { year, sem_index, unit_index, target_unit_before_swap }
		let best_conflict_count = Infinity;

		for (const offered_term of offered_terms) {
			if (semester.sem_term === offered_term) continue;

			const target_semesters = FindSemestersByTerm(planner, offered_term);

			for (const target_semester of target_semesters) {

				if (target_semester.year === year_num && target_semester.sem_index === sem_index) continue;

				const target_year_obj = planner.years.find(y => y.year === target_semester.year);
				const target_sem_obj = target_year_obj.semesters[target_semester.sem_index];

				for (let target_unit_idx = 0; target_unit_idx < target_sem_obj.units.length; target_unit_idx++) {
					const target_unit = target_sem_obj.units[target_unit_idx];
					try {
						let swapped_planner = planner.SwapUnits(
							year_num, sem_index, unit_index,
							target_semester.year, target_semester.sem_index, target_unit_idx,
							false
						);


						// Find the new positions of the swapped units
						const new_conflicts = swapped_planner.GetConflictingUnitsIndex();
						let new_conflicts_count = new_conflicts.length


						// Find conflicts for both swapped units
						const swapped_unit_conflicts = new_conflicts.filter(c =>
							(c.year_num === target_semester.year && c.sem_index === target_semester.sem_index && c.unit_index === target_unit_idx) ||
							(c.year_num === year_num && c.sem_index === sem_index && c.unit_index === unit_index)
						);

						if (swapped_unit_conflicts.length > 0) {
							// If either of the swapped units remains conflicted, skip this candidate
							continue;
						}
						// Track the best candidate (fewest total conflicts)
						const is_candidate_elective = (
							!target_unit?.unit?.code ||
							(target_unit?.unit_type?._name && String(target_unit.unit_type._name).toLowerCase().includes('elective'))
						);
						if (new_conflicts_count < best_conflict_count) {
							best_conflict_count = new_conflicts_count;
							best_swap = {
								year: target_semester.year,
								sem_index: target_semester.sem_index,
								unit_index: target_unit_idx,
								target_unit_before_swap: target_unit,
								is_elective: is_candidate_elective
							};
						} else if (new_conflicts_count === best_conflict_count) {
							// Tie-breaker on proximity to current (year_num, sem_index)
							const current_year = year_num;
							const current_sem = sem_index;
							const candidate = {
								year: target_semester.year,
								sem_index: target_semester.sem_index,
								unit_index: target_unit_idx,
								target_unit_before_swap: target_unit,
								is_elective: is_candidate_elective
							};
							const is_candidate_later_or_equal = (candidate.year > current_year) || (candidate.year === current_year && candidate.sem_index >= current_sem);
							let chooseCandidate = false;
							if (!best_swap) {
								chooseCandidate = true;
							} else {
								// Prefer elective target when conflicts tie
								if (candidate.is_elective && !best_swap.is_elective) {
									chooseCandidate = true;
								} else if (candidate.is_elective === best_swap.is_elective) {
									const is_best_later_or_equal = (best_swap.year > current_year) || (best_swap.year === current_year && best_swap.sem_index >= current_sem);
									const candidate_distance = Math.abs(candidate.year - current_year) * 100 + Math.abs(candidate.sem_index - current_sem);
									const best_distance = Math.abs(best_swap.year - current_year) * 100 + Math.abs(best_swap.sem_index - current_sem);

									if (priortise_later_sems) {
										// Prefer later/equal semesters first; if same side, pick nearer
										if (is_candidate_later_or_equal && !is_best_later_or_equal) {
											chooseCandidate = true;
										} else if (is_candidate_later_or_equal === is_best_later_or_equal) {
											chooseCandidate = candidate_distance < best_distance;
										}
									} else {
										// No direction preference; simply choose the nearer one
										chooseCandidate = candidate_distance < best_distance;
									}
								}
							}

							if (chooseCandidate) {
								best_swap = candidate;
							}
						}

						// If there are conflicts, do not attempt to resolve recursively, just try next position
					} catch (error) {
						continue;
					}
				}
			}
		}
		if (best_swap) {
			// Apply the best swap found
			planner.years = planner.SwapUnits(
				year_num, sem_index, unit_index,
				best_swap.year, best_swap.sem_index, best_swap.unit_index,
				false
			).years;

			// Target unit details before swap
			const target_unit_before = best_swap.target_unit_before_swap;
			// Get target semester type for amendments
			const target_year_after = planner.years.find(y => y.year === best_swap.year);
			const target_sem_after = target_year_after.semesters[best_swap.sem_index];

			// Record the amendment for swapping units (both directions)
			this.MakeAmendments(
				unit?.unit?.code || null,
				target_unit_before?.unit?.code || null,
				unit.unit_type?._type_id || null,
				target_unit_before?.unit_type?._type_id || null,
				year_num,
				sem_index,
				'swapped',
				semester.sem_type,
				semester.sem_id,
				unit?.unit?.unit_id,
				target_unit_before?.unit?.unit_id
			);

			this.MakeAmendments(
				target_unit_before?.unit?.code || null,
				unit.unit?.code || null,
				target_unit_before?.unit_type?._type_id || null,
				unit.unit_type?._type_id || null,
				best_swap.year,
				best_swap.sem_index,
				'swapped',
				target_sem_after.sem_type,
				target_sem_after.sem_id,
				target_unit_before?.unit?.unit_id,
				unit?.unit?.unit_id,
			);
			return true;
		}
		return false;
	}

	/**
	 * Solve complex requisite conflicts by analyzing AND/OR groups and targeting unsatisfied groups
	 */
	SolveComplexRequisiteConflict(planner, year_num, sem_index, unit_index, completed_codes, units_offered) {
		const year = planner.years.find(y => y.year === year_num);
		const semester = year.semesters[sem_index];
		const unit = semester.units[unit_index];

		if (!unit.requisites || unit.requisites.length === 0) return false;

		// Group requisites by operator (AND/OR logic)
		const groups = GroupRequisitesByOperator(unit.requisites);

		// Track which groups are satisfied
		const groupResults = groups.map(group => {
			const results = group.requisites.map(req =>
				EvaluateSingleRequisite(req, completed_codes, planner, year_num, sem_index, this.completed_units)
			);
			return {
				group,
				results,
				isSatisfied: group.operator === 'and' ? results.every(Boolean) : results.some(Boolean)
			};
		});

		// If all groups are satisfied, no conflict
		if (groupResults.every(gr => gr.isSatisfied)) return true;

		// Try to resolve only the unsatisfied groups
		for (const gr of groupResults) {
			if (gr.isSatisfied) continue;
			// For AND: all must be satisfied, for OR: at least one
			for (let i = 0; i < gr.group.requisites.length; i++) {
				const req = gr.group.requisites[i];
				if (gr.results[i]) continue; // Already satisfied

				// Try to resolve this specific requisite
				switch (req._unit_relationship) {
					case 'pre':
						if (this.SolvePrerequisiteConflict(planner, year_num, sem_index, unit_index, completed_codes, units_offered)) {
							return true;
						}
						break;
					case 'co':
						if (this.SolveCorequisiteConflict(planner, year_num, sem_index, unit_index, completed_codes, units_offered)) {
							return true;
						}
						break;
					case 'anti':
						if (this.SolveAntirequisiteConflict(planner, year_num, sem_index, unit_index, completed_codes, units_offered)) {
							return true;
						}
						break;
					case 'min': {
						if (this.SolveMinCPConflict(planner, year_num, sem_index, unit_index, req, completed_codes, units_offered)) {
							return true;
						}
						break;
					}
					default:
						break;
				}
			}
		}

		// If none of the unsatisfied groups could be resolved, return false
		return false;
	}

	/**
	 * Solve prerequisite conflicts by finding a unit that can be swapped
	 */
	SolvePrerequisiteConflict(planner, year_num, sem_index, unit_index, completed_codes, units_offered) {
		const year = planner.years.find(y => y.year === year_num);
		const semester = year.semesters[sem_index];
		const unit = semester.units[unit_index];

		// Find all available units in the planner that could be swapped
		const available_units = FindAvailableUnitsForSwap(planner, year_num, sem_index, unit_index, completed_codes, units_offered, this.completed_units);

		// Try to swap with the best available unit
		for (const available_unit of available_units) {
			try {
				const swapped_planner = planner.SwapUnits(
					year_num, sem_index, unit_index,
					available_unit.year, available_unit.sem_index, available_unit.unit_index,
					false
				);

				// Check if the swap resolved the conflict for BOTH units
				const new_conflicts = swapped_planner.GetConflictingUnitsIndex();
				const conflict_for_first = new_conflicts.some(c =>
					c.year_num === available_unit.year && c.sem_index === available_unit.sem_index && c.unit_index === available_unit.unit_index
				);
				const conflict_for_second = new_conflicts.some(c =>
					c.year_num === year_num && c.sem_index === sem_index && c.unit_index === unit_index
				);

				if (!conflict_for_first && !conflict_for_second) {
					// Update the planner with the successful swap
					planner.years = swapped_planner.years;
					// Record the amendment
					this.MakeAmendments(
						unit.unit?.code || null,
						available_unit.unit?.code || null,
						unit.unit_type?._type_id || null,
						available_unit.unit_type?._type_id || null,
						year_num,
						sem_index,
						'swapped',
						semester.sem_type,
						semester.sem_id,
						unit.unit.unit_id,
						available_unit.unit.unit_id
					);
					// Reverse direction
					this.MakeAmendments(
						available_unit.unit?.code || null,
						unit.unit?.code || null,
						available_unit.unit_type?._type_id || null,
						unit.unit_type?._type_id || null,
						available_unit.year,
						available_unit.sem_index,
						'swapped',
						available_unit.sem_type,
						available_unit.sem_id,
						available_unit.unit?.unit_id,
						unit.unit?.unit_id
					);
					return true;
				}
			} catch (error) {
				continue;
			}
		}

		return false;
	}

	/**
	 * Solve antirequisite conflicts by moving the current unit to a different semester
	 */
	SolveAntirequisiteConflict(planner, year_num, sem_index, unit_index, completed_codes, units_offered) {
		const year = planner.years.find(y => y.year === year_num);
		const semester = year.semesters[sem_index];
		const unit = semester.units[unit_index];

		// Find antirequisite requirements
		const antirequisites = unit.requisites?.filter(r => r._unit_relationship === 'anti') || [];

		for (const anti_req of antirequisites) {
			if (!anti_req._requisite_unit_code) continue;

			// Find the conflicting unit in the same semester
			const conflicting_unit_index = semester.units.findIndex(u => u.unit?.code === anti_req._requisite_unit_code);

			if (conflicting_unit_index !== -1) {
				// Find semesters where this unit is offered
				const offered_terms = units_offered
					.filter(uo => uo._unit_code === unit.unit?.code)
					.map(uo => uo._term_type);

				// If no specific offering data, assume it can be offered in any semester
				if (offered_terms.length === 0 && unit.unit?.code) {
					offered_terms.push('Semester 1', 'Semester 2', 'Summer', 'Winter');
				}

				// Try to swap to a different semester where the unit is offered
				for (const offered_term of offered_terms) {
					// Skip if the unit is already in a semester with this term
					if (semester.sem_term === offered_term) {
						continue;
					}

					const target_semesters = FindSemestersByTerm(planner, offered_term);

					for (const target_semester of target_semesters) {
						// Skip if it's the same semester
						if (target_semester.year === year_num && target_semester.sem_index === sem_index) {
							continue;
						}

						const target_year_obj = planner.years.find(y => y.year === target_semester.year);
						const target_sem_obj = target_year_obj.semesters[target_semester.sem_index];

						// Look for a unit in the target semester that could be swapped
						for (let target_unit_idx = 0; target_unit_idx < target_sem_obj.units.length; target_unit_idx++) {
							const target_unit = target_sem_obj.units[target_unit_idx];

							// Check if the target unit is offered in the current semester's term or is an elective
							const target_unit_offered_terms = units_offered
								.filter(uo => uo._unit_code === target_unit.unit?.code)
								.map(uo => uo._term_type);

							if (target_unit_offered_terms.includes(semester.sem_term) ||
								!target_unit.unit?.code || // Elective unit
								target_unit.unit_type?._name?.toLowerCase().includes('elective')) {

								// Try to swap the units using StudyPlanner's SwapUnits method
								try {
									const swapped_planner = planner.SwapUnits(
										year_num, sem_index, unit_index,
										target_semester.year, target_semester.sem_index, target_unit_idx,
										false
									);

									// Check if the swap resolved the antirequisite conflict
									const new_conflicts = swapped_planner.GetConflictingUnitsIndex();
									const conflict_resolved = !new_conflicts.some(c =>
										c.year_num === year_num && c.sem_index === sem_index && c.unit_index === unit_index
									);

									if (conflict_resolved) {
										// Update the planner with the successful swap
										planner.years = swapped_planner.years;

										// Record the amendment for swapping the current unit
										this.MakeAmendments(
											unit.unit?.code || null,
											target_unit.unit?.code || null,
											unit.unit_type?._type_id || null,
											target_unit.unit_type?._type_id || null,
											year_num,
											sem_index,
											'swapped',
											semester.sem_type,
											semester.sem_id,
											unit.unit?.unit_id,
											target_unit.unit?.unit_id
										);
										this.MakeAmendments(
											target_unit.unit?.code || null,
											unit.unit?.code || null,
											target_unit.unit_type?._type_id || null,
											target_unit.unit_type?._type_id || null,
											target_semester.year,
											target_semester.sem_index,
											'swapped',
											target_semester.sem_type,
											target_semester.sem_id,
											target_unit.unit?.unit_id,
											unit.unit?.unit_id,
										);

										return true;
									}
								} catch (error) {
									continue;
								}
							}
						}
					}
				}
			}
		}

		return false;
	}

	/**
	 * Solve corequisite conflicts by ensuring both units are in the same semester
	 */
	SolveCorequisiteConflict(planner, year_num, sem_index, unit_index, completed_codes, units_offered) {
		const year = planner.years.find(y => y.year === year_num);
		const semester = year.semesters[sem_index];
		const unit = semester.units[unit_index];

		// Find corequisite requirements
		const corequisites = unit.requisites?.filter(r => r._unit_relationship === 'co') || [];

		for (const co_req of corequisites) {
			if (!co_req._requisite_unit_code) continue;

			// Check if corequisite is already in the same semester
			const co_unit_in_semester = semester.units.some(u => u.unit?.code === co_req._requisite_unit_code);
			if (co_unit_in_semester) continue;

			// Try to find the corequisite unit in the planner
			const co_unit_position = FindUnitInPlanner(planner, co_req._requisite_unit_code);
			if (!co_unit_position) continue;

			// Get the semester where the corequisite unit is located
			const co_target_sem = planner.years[co_unit_position.year - 1].semesters[co_unit_position.sem_index];

			// Looping through every unit in the co-requisite's unit's semester, to find a slot of the conflicting unit
			for (let target_unit_idx = 0; target_unit_idx < co_target_sem.units.length; target_unit_idx++) {

				//Conflicting unit's co-requisite's unit position
				const target_unit = co_target_sem.units[target_unit_idx];
				const target_unit_offered_terms = units_offered.filter(uo => uo.unit_id === target_unit.unit?.unit_id).map(uo => uo._term_type);
				if (
					target_unit_offered_terms.includes(co_target_sem.sem_term) ||
					!target_unit.unit?.code ||
					target_unit.unit_type?._name?.toLowerCase().includes('elective')
				) {
					try {
						if (co_unit_position.unit_index == target_unit_idx) {
							continue;
						}

						//Swapping the planner until both have no conflicts
						const swapped_planner = planner.SwapUnits(
							year_num, sem_index, unit_index, //Current unit
							co_unit_position.year, co_unit_position.sem_index, target_unit_idx, //Target unit
							false
						);

						const new_conflicts = swapped_planner.GetConflictingUnitsIndex();
						const conflict_for_first = new_conflicts.some(c =>
							c.year_num === co_unit_position.year && c.sem_index === co_unit_position.sem_index && c.unit_index === co_unit_position.unit_index
						);
						const conflict_for_second = new_conflicts.some(c =>
							c.year_num === year_num && c.sem_index === sem_index && c.unit_index === target_unit_idx
						);

						if (!conflict_for_first && !conflict_for_second) {
							// Update the planner with the successful swap
							planner.years = swapped_planner.years;

							this.MakeAmendments(
								unit.unit?.code || null,
								target_unit.unit?.code || null,
								unit.unit_type?._type_id || null,
								target_unit.unit_type?._type_id || null,
								co_unit_position.year,
								co_unit_position.sem_index,
								'swapped',
								semester.sem_type,
								semester.sem_id,
								// co_target_sem.sem_type,
								// co_target_sem.sem_id,
								unit.unit.unit_id,
								target_unit.unit.unit_id
							);
							this.MakeAmendments(
								target_unit.unit?.code || null,
								unit.unit?.code || null,
								target_unit.unit_type?._type_id || null,
								unit.unit_type?._type_id || null,
								year_num,
								sem_index,
								'swapped',
								// semester.sem_type,
								// semester.sem_id,
								co_target_sem.sem_type,
								co_target_sem.sem_id,
								target_unit.unit.unit_id,
								unit.unit.unit_id
							);
							return true;
						}
					} catch (error) {
						continue;
					}
				}
			}

			// 2. If not possible, try to swap the corequisite unit to any semester after the co-requisite unit's semester
			let after = false;
			// co_unit_position.year = 1 , planner.years = 1, y++
			for (let y = co_unit_position.year; y <= planner.years.length; y++) {
				const target_year = planner.years.find(yr => yr.year === y);
				if (!target_year) continue;

				//Loop through each of the semester in the target year 
				for (let s = 0; s < target_year.semesters.length; s++) {
					// Only consider semesters after the co-requisite's semester in the same year, or any semester in later years
					if (y === co_unit_position.year && s < co_unit_position.sem_index) continue;
					const target_semester = target_year.semesters[s];
					for (let u = 0; u < target_semester.units.length; u++) {
						const target_unit = target_semester.units[u];
						// Don't swap with itself
						if (y === year_num && s === sem_index && u === unit_index) continue;

						try {
							const swapped_planner = planner.SwapUnits(
								year_num, sem_index, unit_index,
								y, s, u,
								false
							);
							// Check for conflicts for both swapped units
							const new_conflicts = swapped_planner.GetConflictingUnitsIndex();
							const conflict_for_first = new_conflicts.some(c =>
								c.year_num === year_num && c.sem_index === sem_index && c.unit_index === unit_index
							);
							const conflict_for_second = new_conflicts.some(c =>
								c.year_num === y && c.sem_index === s && c.unit_index === u
							);

							if (!conflict_for_first && !conflict_for_second) {
								// Update the planner with the successful swap
								planner.years = swapped_planner.years;

								this.MakeAmendments(
									unit.unit?.code || null,
									target_unit.unit?.code || null,
									unit.unit_type?._type_id || null,
									target_unit.unit_type?._type_id || null,
									year_num,
									sem_index,
									'swapped',
									semester.sem_type,
									semester.sem_id,
									unit.unit?.unit_id,
									target_unit.unit?.unit_id
								);
								this.MakeAmendments(
									target_unit.unit?.code || null,
									unit.unit?.code || null,
									target_unit.unit_type?._type_id || null,
									unit.unit_type?._type_id || null,
									y,
									s,
									'swapped',
									target_year.semesters[s].sem_type,
									target_year.semesters[s].sem_id,
									target_unit.unit?.unit_id,
									unit.unit?.unit_id
								);
								return true;
							}
						} catch (error) {
							continue;
						}
					}
				}
			}
		}
		return false;
	}

	/**
	 * Try to swap the current unit with a unit in later semesters to satisfy minCP, prioritizing electives
		*/
	/**
	 * Attempts to resolve a minimum credit points (CP) conflict in the student's study planner by swapping the current unit
	 * with a unit in a later semester, prioritizing elective units for the swap. The function checks all possible swaps in
	 * subsequent semesters and returns true if a valid swap is found and performed, otherwise returns false.
	 *
	 * @param {Object} planner - The current study planner object containing years and semesters.
	 * @param {number} year_num - The year number of the unit to be swapped.
	 * @param {number} sem_index - The semester index of the unit to be swapped.
	 * @param {number} unit_index - The index of the unit within the semester to be swapped.
	 * @param {Object} req - The minimum credit point requirement object.
	 * @param {string[]} completed_codes - Array of unit codes that have been completed by the student.
	 * @param {Object[]} units_offered - Array of units offered in the planner.
	 * @returns {boolean} True if a swap was made to resolve the conflict, otherwise false.
	 */
	SolveMinCPConflict(planner, year_num, sem_index, unit_index, req, completed_codes, units_offered) {
		const currentYearIdx = planner.years.findIndex(y => y.year === year_num);
		let electiveSwap = null;
		let otherSwap = null;

		year_loop:
		for (let y = currentYearIdx; y < planner.years.length; y++) {
			const yearObj = planner.years[y];
			for (let s = 0; s < yearObj.semesters.length; s++) {
				if (y === currentYearIdx && s <= sem_index) continue; // Only later semesters
				const semObj = yearObj.semesters[s];
				for (let u = 0; u < semObj.units.length; u++) {
					const target_unit = semObj.units[u];
					const isElective = target_unit.unit_type?._name?.toLowerCase().includes('elective');
					try {
						const swapped_planner = planner.SwapUnits(
							year_num, sem_index, unit_index,
							yearObj.year, s, u,
							false
						);
						//If swapped planner have same conflicting indexs, then skip
						let swapped_planner_conflcits = swapped_planner.GetConflictingUnitsIndex()
						if (
							swapped_planner_conflcits.some(
								conflict =>
									conflict.year_num === year_num &&
									conflict.sem_index === sem_index &&
									conflict.unit_index === unit_index
							)
							||
							swapped_planner_conflcits.some(
								conflict =>
									conflict.year_num === yearObj.year &&
									conflict.sem_index === s &&
									conflict.unit_index === u
							)
						) {
							continue;
						}

						if (EvaluateMinCP(req, this.CompletedUnits, swapped_planner, yearObj.year, s)) {
							if (isElective) {
								electiveSwap = { swapped_planner, year: yearObj.year, sem: s, unit: u };
							} else {
								otherSwap = { swapped_planner, year: yearObj.year, sem: s, unit: u };
							}
							break year_loop;
						}
					} catch (error) {
						continue;
					}
				}
			}
		}
		if (electiveSwap) {
			planner.years = electiveSwap.swapped_planner.years;

			// Record amendments both ways
			const current_unit = planner.years.find(y => y.year === year_num)
				.semesters[sem_index].units[unit_index];
			const target_unit = planner.years.find(y => y.year === electiveSwap.year)
				.semesters[electiveSwap.sem].units[electiveSwap.unit];

			this.MakeAmendments(
				current_unit.unit?.code || null,
				target_unit.unit?.code || null,
				current_unit.unit_type?._type_id || null,
				target_unit.unit_type?._type_id || null,
				year_num,
				sem_index,
				'swapped',
				planner.years.find(y => y.year === electiveSwap.year)
					.semesters[electiveSwap.sem].sem_type,
				planner.years.find(y => y.year === electiveSwap.year)
					.semesters[electiveSwap.sem].sem_id,
				current_unit.unit.unit_id,
				target_unit.unit.unit_id
			);
			this.MakeAmendments(
				target_unit.unit?.code || null,
				current_unit.unit?.code || null,
				target_unit.unit_type?._type_id || null,
				current_unit.unit_type?._type_id || null,
				electiveSwap.year,
				electiveSwap.sem,
				'swapped',
				planner.years.find(y => y.year === year_num)
					.semesters[sem_index].sem_type,
				planner.years.find(y => y.year === year_num)
					.semesters[sem_index].sem_id,
				target_unit.unit.unit_id,
				current_unit.unit.unit_id
			);
			return true;
		}
		if (otherSwap) {
			planner.years = otherSwap.swapped_planner.years;

			// Record amendments both ways
			const current_unit = planner.years.find(y => y.year === year_num).semesters[sem_index].units[unit_index];
			const target_unit = planner.years.find(y => y.year === otherSwap.year).semesters[otherSwap.sem].units[otherSwap.unit];

			this.MakeAmendments(
				current_unit.unit?.code || null,
				target_unit.unit?.code || null,
				current_unit.unit_type?._type_id || null,
				target_unit.unit_type?._type_id || null,
				year_num,
				sem_index,
				'swapped',
				planner.years.find(y => y.year === otherSwap.year).semesters[otherSwap.sem].sem_type,
				planner.years.find(y => y.year === otherSwap.year).semesters[otherSwap.sem].sem_id,
				current_unit.unit.unit_id,
				target_unit.unit.unit_id
			);
			this.MakeAmendments(
				target_unit.unit?.code || null,
				current_unit.unit?.code || null,
				target_unit.unit_type?._type_id || null,
				current_unit.unit_type?._type_id || null,
				otherSwap.year,
				otherSwap.sem,
				'swapped',
				planner.years.find(y => y.year === year_num).semesters[sem_index].sem_type,
				planner.years.find(y => y.year === year_num).semesters[sem_index].sem_id,
				target_unit.unit.unit_id,
				current_unit.unit.unit_id
			);
			return true;
		}
		return false;
	}

	GetAllPassedAndPlannedUnitsRatioByUnitType() {
		// Result object to store unit types and their counts
		const result = {};

		// Process all units across all years and semesters
		for (const year of this.study_planner.years) {
			for (const semester of year.semesters) {
				for (const unit of semester.units) {
					// Skip units without a unit type or required data
					if (!unit.unit_type || !unit.unit_type._name) continue;

					const typeName = unit.unit_type._name;
					const typeColor = unit.unit_type._color || '#CCCCCC'; // Default color if none provided

					// Initialize counter for this unit type if it doesn't exist
					if (!result[typeName]) {
						result[typeName] = {
							passed: 0,
							planned: 0,
							total: 0,
							color: typeColor // Add color property
						};
					}

					// Count based on unit status
					if (unit.status === 'pass') {
						result[typeName].passed++;
					} else if (unit.status === 'planned' || !unit.status) {
						// Consider units without status as planned in master planner mode
						result[typeName].planned++;
					}

					// Increment total count for this unit type
					result[typeName].total++;
				}
			}
		}

		// Calculate ratios and format the result
		const formattedResult = {};
		for (const typeName in result) {
			const { passed, planned, total, color } = result[typeName];
			const passedAndPlanned = passed + planned;

			formattedResult[typeName] = {
				passed,
				planned,
				passedAndPlanned,
				total,
				ratio: `${passedAndPlanned}/${total}`,
				color: color
			};
		}

		return formattedResult;
	}
}
export default StudentStudyPlanner;

//External Helper Functions
function getUnitTypeInfo(typeId) {
	if (typeId === -1) return { name: "Deleted", color: "#ff4d4d" };
	if (!typeId) return null;

	// Change _type_id to _id to match your unit_type_info
	const unitType = unit_type_info.find(type => type._id === typeId);
	return unitType ? { type_id: typeId, name: unitType._name, color: unitType._colour } : { type_id: typeId, name: `Type ${typeId}`, color: "#cccccc" };
};

function GetUnitTypeByName(name) {
	const unitType = unit_type_info.find(type => type._name.toLowerCase() === name.toLowerCase());
	return unitType ? { _type_id: unitType._id, _name: unitType._name, _color: unitType._colour } : null;
}

function GetUnitIndexByYearandSem(years, year, sem, unit_code, master_mode = true, skip_elective = false, include_pass = false) {
	const YearObj = years.find(y => y.year === year);
	if (!YearObj) {
		// Instead of throwing, log and return -1
		return -1;
	}
	const SemObj = YearObj.semester[sem];
	if (!SemObj) {
		// Instead of throwing, log and return -1
		return -1;
	}
	let unit_index = -1;

	if (!master_mode) {
		if (skip_elective) {
			unit_index = SemObj.units.findIndex(
				u =>
					u.unit?.code === unit_code &&
					(u.status === 'planned' || (include_pass && u.status === 'pass')) &&
					!u.unit_type?._name.toLowerCase().includes('elective')
			);
		} else {
			unit_index = SemObj.units.findIndex(
				u =>
					u.unit?.code === unit_code &&
					(u.status === 'planned' || (include_pass && u.status === 'pass'))
			);
		}
	} else {
		if (skip_elective) {
			unit_index = SemObj.units.findIndex(u => u.unit?.code === unit_code && !u.unit_type?._name.toLowerCase().includes('elective'));
		} else {
			unit_index = SemObj.units.findIndex(u => u.unit?.code === unit_code);
		}
	}
	if (unit_index === -1) {
		// Instead of throwing, log and return -1
		return -1;
	}
	return unit_index;
}

function EnsureUnitInPlanner(years, year, sem_index, new_unit_code, amendments, unit_data = null, sem_type = "Long Semester") {
	while (!years.find(y => y.year === year)) {
		AddNewYear(years, year);
	}

	let year_obj = years.find(y => y.year === year);

	while (!year_obj.semester[sem_index]) {
		AddNewSemesterInYear(years, year_obj, sem_index, sem_type);
	}

	const unit_pos = GetUnitPosition(years, new_unit_code, false, false);

	if (unit_pos) {
		const new_unit_data = years.find(y => y.year == unit_pos.year).semester[unit_pos.semesterIndex].units[unit_pos.unitIndex];
		years.find(y => y.year == year).semester[sem_index].units.push(new_unit_data);
		years.find(y => y.year == year).semester[sem_index].unit_count++;

		//delete the old unit
		years.find(y => y.year == unit_pos.year).semester[unit_pos.semesterIndex].units.splice(unit_pos.unitIndex, 1);
		years.find(y => y.year == unit_pos.year).semester[unit_pos.semesterIndex].unit_count--;
	} else {
		years.find(y => y.year == year).semester[sem_index].units.push(unit_data);
		years.find(y => y.year == year).semester[sem_index].unit_count++;
	}
	amendments.has_applied = true;

}

function GetUnitPosition(years, unit_code = null, include_pass = false, get_empty = false, skip_elective = false, target_unit_id = null) {
	for (let yearIndex = 0; yearIndex < years.length; yearIndex++) {
		const year = years[yearIndex];
		for (let semIndex = 0; semIndex < year.semester.length; semIndex++) {
			const sem = year.semester[semIndex];
			for (let unitIndex = 0; unitIndex < sem.units.length; unitIndex++) {
				const unit = sem.units[unitIndex];
				const unit_id = unit.unit.unit_id ?? null;
				if (get_empty) {
					if (!unit.unit_type) {
						return {
							year: year.year,
							semesterIndex: semIndex,
							unitIndex: unitIndex
						};
					} else if (unit.unit.name == null) {
						return {
							year: year.year,
							semesterIndex: semIndex,
							unitIndex: unitIndex
						};
					}
					continue;
				}
				if (unit.unit?.code === unit_code && (unit_id === target_unit_id)) {

					if (include_pass) {
						if (skip_elective) {
							if (!unit.unit_type?._name.toLowerCase().includes('elective')) {
								return {
									year: year.year,
									semesterIndex: semIndex,
									unitIndex: unitIndex
								};
							}
						} else {
							return {
								year: year.year,
								semesterIndex: semIndex,
								unitIndex: unitIndex
							};
						}
					} else {
						if (skip_elective) {
							if (!unit.unit_type?._name.toLowerCase().includes('elective')) {
								if (unit.status == 'planned') {
									return {
										year: year.year,
										semesterIndex: semIndex,
										unitIndex: unitIndex
									};
								}
							}
						} else {
							if (unit.status == 'planned') {
								return {
									year: year.year,
									semesterIndex: semIndex,
									unitIndex: unitIndex
								};
							}
						}
					}
				}
			}
		}
	}
	if (!unit_code) {
		return null;
	}
	return null;
}

function AddNewYear(years, year) {
	years.push({
		year: year,
		semester: []
	});
}

function IsSemesterCompleted(years, year, sem_index) {
	const yearObj = years.find(y => y.year === year);
	if (!yearObj) return false;
	const semester = yearObj.semester[sem_index];
	if (!semester) return false;
	return semester.complete === true;
}

function AddNewSemesterInYear(years, year_obj, sem_index, sem_type) {
	// Find previous semester to determine term attributes
	let prev_sem = null;
	if (sem_index > 0 && year_obj.semester[sem_index - 1]) {
		prev_sem = year_obj.semester[sem_index - 1];
	} else {
		// Look for last semester in previous years
		for (let y = year_obj.year - 1; y >= 1; y--) {
			const prevYear = years.find(yr => yr.year === y);
			if (prevYear && prevYear.semester && prevYear.semester.length > 0) {
				prev_sem = prevYear.semester[prevYear.semester.length - 1];
				break;
			}
		}
	}

	// Determine semester name, term, and dates based on type and previous semester
	let sem_name, sem_term, term = {};

	// If no previous semester found, use current date to determine
	if (!prev_sem || !prev_sem.term) {
		const currentDate = new Date();
		const currentYear = currentDate.getFullYear();
		const currentMonth = currentDate.getMonth() + 1;

		if (sem_type === "Long Semester") {
			if (currentMonth < 6) {
				sem_name = "Feb/Mar";
				sem_term = "Semester 1";
				term = {
					Name: sem_name,
					Year: currentYear,
					SemType: sem_type,
					Month: 2,
					Term: sem_term
				};
			} else {
				sem_name = "Aug/Sept";
				sem_term = "Semester 2";
				term = {
					Name: sem_name,
					Year: currentYear,
					SemType: sem_type,
					Month: 9,
					Term: sem_term
				};
			}
		} else { // Short Semester
			if (currentMonth < 6) {
				sem_name = "Jan";
				sem_term = "Summer";
				term = {
					Name: sem_name,
					Year: currentYear,
					SemType: sem_type,
					Month: 1,
					Term: sem_term
				};
			} else {
				sem_name = "Jul";
				sem_term = "Winter";
				term = {
					Name: sem_name,
					Year: currentYear,
					SemType: sem_type,
					Month: 7,
					Term: sem_term
				};
			}
		}
	} else {
		// Calculate based on previous semester
		const prevMonth = prev_sem.term.Month;
		const prevYear = prev_sem.term.Year;

		if (sem_type === "Long Semester") {
			if (prevMonth < 6) {
				sem_name = "Aug/Sept";
				sem_term = "Semester 2";
				term = {
					Name: sem_name,
					Year: prevYear,
					SemType: sem_type,
					Month: 9,
					Term: sem_term
				};
			} else {
				sem_name = "Feb/Mar";
				sem_term = "Semester 1";
				term = {
					Name: sem_name,
					Year: prevYear + 1,
					SemType: sem_type,
					Month: 2,
					Term: sem_term
				};
			}
		} else { // Short Semester
			if (prevMonth < 6) {
				sem_name = "Jul";
				sem_term = "Winter";
				term = {
					Name: sem_name,
					Year: prevYear,
					SemType: sem_type,
					Month: 7,
					Term: sem_term
				};
			} else {
				sem_name = "Jan";
				sem_term = "Summer";
				term = {
					Name: sem_name,
					Year: prevYear + 1,
					SemType: sem_type,
					Month: 1,
					Term: sem_term
				};
			}
		}
	}

	// Create and add the new semester
	const newSemester = {
		sem_type: sem_type,
		units: [],
		unit_count: 0,
		term: term
	};

	year_obj.semester.push(newSemester);

	// Recalculate all subsequent semesters
	const yearIndex = years.findIndex(y => y.year === year_obj.year);
	if (yearIndex === -1) return year_obj; // Safety check

	let currentYearIndex = yearIndex;
	let currentSemIndex = year_obj.semester.length - 1;
	let prevSem = newSemester;

	while (currentYearIndex < years.length) {
		const currentYear = years[currentYearIndex];
		const startIndex = (currentYearIndex === yearIndex) ? currentSemIndex + 1 : 0;

		// Skip if this year has no more semesters to process
		if (startIndex >= currentYear.semester.length) {
			currentYearIndex++;
			continue;
		}

		for (let i = startIndex; i < currentYear.semester.length; i++) {
			const semester = currentYear.semester[i];

			// Determine the next intake month and year
			let nextIntakeMonth;
			let nextIntakeYear;

			if (prevSem && prevSem.term) {
				const lastIntakeMonth = prevSem.term.Month;
				nextIntakeYear = prevSem.term.Year;

				if (semester.sem_type === "Short Semester") {
					if (lastIntakeMonth < 6) {
						nextIntakeMonth = "Jul";
					} else {
						nextIntakeMonth = "Jan";
						nextIntakeYear++;
					}
				} else {
					if (lastIntakeMonth < 6) {
						nextIntakeMonth = "Aug/Sept";
					} else {
						nextIntakeMonth = "Feb/Mar";
						nextIntakeYear++;
					}
				}
			} else {
				// First semester after removal or no previous semester
				if (currentYearIndex === 0 && i === 0) {
					// First semester of first year - use default values
					nextIntakeYear = new Date().getFullYear();
					const currentMonth = new Date().getMonth() + 1;

					if (semester.sem_type === "Short Semester") {
						nextIntakeMonth = currentMonth < 6 ? "Jan" : "Jul";
					} else {
						nextIntakeMonth = currentMonth < 6 ? "Feb/Mar" : "Aug/Sept";
					}
				} else {
					// Recursively check previous years until we find a semester
					let foundSemester = false;
					let checkYear = currentYearIndex - 1;

					while (checkYear >= 0 && !foundSemester) {
						const previousYear = years[checkYear];
						if (previousYear && previousYear.semester.length > 0) {
							const lastSemOfPrevYear = previousYear.semester[previousYear.semester.length - 1];

							if (lastSemOfPrevYear.term) {
								nextIntakeYear = lastSemOfPrevYear.term.Year;
								const lastIntakeMonth = lastSemOfPrevYear.term.Month;

								if (semester.sem_type === "Short Semester") {
									if (lastIntakeMonth < 6) {
										nextIntakeMonth = "Jul";
									} else {
										nextIntakeMonth = "Jan";
										nextIntakeYear++;
									}
								} else {
									if (lastIntakeMonth < 6) {
										nextIntakeMonth = "Aug/Sept";
									} else {
										nextIntakeMonth = "Feb/Mar";
										nextIntakeYear++;
									}
								}
								foundSemester = true;
							}
						}
						checkYear--;
					}

					// If no semester found in previous years, use current date
					if (!foundSemester) {
						nextIntakeYear = new Date().getFullYear();
						const currentMonth = new Date().getMonth() + 1;

						if (semester.sem_type === "Short Semester") {
							nextIntakeMonth = currentMonth < 6 ? "Jan" : "Jul";
						} else {
							nextIntakeMonth = currentMonth < 6 ? "Feb/Mar" : "Aug/Sept";
						}
					}
				}
			}

			// Update semester's term
			if (!semester.term) {
				semester.term = {};
			}

			semester.term.Name = nextIntakeMonth;
			semester.term.Year = nextIntakeYear;

			// Update month based on name
			if (nextIntakeMonth === "Jan") {
				semester.term.Month = 1;
			} else if (nextIntakeMonth === "Feb/Mar") {
				semester.term.Month = 2;
			} else if (nextIntakeMonth === "Jul") {
				semester.term.Month = 7;
			} else if (nextIntakeMonth === "Aug/Sept") {
				semester.term.Month = 9;
			}

			// Update semester term label
			if (semester.sem_type === "Short Semester") {
				if (nextIntakeMonth === "Jan") {
					semester.term.Term = "Summer";
				} else if (nextIntakeMonth === "Jul") {
					semester.term.Term = "Winter";
				}
			} else {
				if (nextIntakeMonth === "Feb/Mar") {
					semester.term.Term = "Semester 1";
				} else if (nextIntakeMonth === "Aug/Sept") {
					semester.term.Term = "Semester 2";
				}

				// Count total long semesters up to this point
				let totalLongSemCount = 0;
				for (let y = 0; y <= currentYearIndex; y++) {
					const year = years[y];
					for (let s = 0; s < (y === currentYearIndex ? i + 1 : year.semester.length); s++) {
						if (year.semester[s].sem_type === "Long Semester") {
							totalLongSemCount++;
						}
					}
				}
			}

			prevSem = semester;
		}

		currentYearIndex++;
		currentSemIndex = 0;
	}

	return year_obj;
}

/**
 * Updates semester information after a semester is removed
 * @param {Array} years - The array of years
 * @param {number} year - Year number where semester was removed
 * @param {number} sem_index - Index of removed semester
 */
function UpdateSemestersAfterRemoval(years, year, sem_index) {
	// Find the year index in the years array
	const yearIndex = years.findIndex(y => y.year === year);
	if (yearIndex === -1) return; // Safety check

	// Find previous semester to determine next scheduling
	let prevSem = null;

	// If we're removing from first year, set prevSem to the semester before the removed one
	if (yearIndex === 0) {
		if (sem_index > 0) {
			prevSem = years[yearIndex].semester[sem_index - 1];
		}
	} else {
		// If not in first year, check the last semester of the previous year
		const previousYear = years[yearIndex - 1];
		if (previousYear && previousYear.semester.length > 0) {
			prevSem = previousYear.semester[previousYear.semester.length - 1];
		}
	}

	// Check if previous semester is completed
	const prevSemIsCompleted = prevSem && prevSem.complete;
	let firstSemAfterCompleted = true;

	// Recalculate all semesters starting from the current year
	let currentYearIndex = yearIndex;

	while (currentYearIndex < years.length) {
		const currentYear = years[currentYearIndex];
		const startIndex = currentYearIndex === yearIndex ? sem_index : 0;

		for (let i = startIndex; i < currentYear.semester.length; i++) {
			const semester = currentYear.semester[i];
			let nextIntakeMonth;
			let nextIntakeYear;

			// If this is the first semester after a completed semester, use current date
			if (prevSemIsCompleted && firstSemAfterCompleted) {
				// Use current date for the first semester after completed
				const currentDate = new Date();
				const currentYear = currentDate.getFullYear();
				const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-indexed

				if (semester.sem_type === "Short Semester") {
					if (currentMonth < 7) {
						nextIntakeMonth = "Jul";
						nextIntakeYear = currentYear;
					} else {
						nextIntakeMonth = "Jan";
						nextIntakeYear = currentYear + 1;
					}
				} else {
					if (currentMonth < 9) {
						nextIntakeMonth = "Aug/Sept";
						nextIntakeYear = currentYear;
					} else {
						nextIntakeMonth = "Feb/Mar";
						nextIntakeYear = currentYear + 1;
					}
				}
				// Only do this for the first semester
				firstSemAfterCompleted = false;
			} else if (prevSem && prevSem.term) {
				const lastIntakeMonth = prevSem.term.Month;
				nextIntakeYear = prevSem.term.Year;

				if (semester.sem_type === "Short Semester") {
					if (lastIntakeMonth < 6) {
						nextIntakeMonth = "Jul";
					} else {
						nextIntakeMonth = "Jan";
						nextIntakeYear++;
					}
				} else {
					if (lastIntakeMonth < 6) {
						nextIntakeMonth = "Aug/Sept";
					} else {
						nextIntakeMonth = "Feb/Mar";
						nextIntakeYear++;
					}
				}
			} else {
				// First semester after removal or no previous semester
				if (currentYearIndex === 0 && i === 0) {
					// First semester of first year - use default values
					nextIntakeYear = new Date().getFullYear();
					const currentMonth = new Date().getMonth() + 1;

					if (semester.sem_type === "Short Semester") {
						nextIntakeMonth = currentMonth < 6 ? "Jan" : "Jul";
					} else {
						nextIntakeMonth = currentMonth < 6 ? "Feb/Mar" : "Aug/Sept";
					}
				} else {
					// Recursively check previous years until we find a semester
					let foundSemester = false;
					let checkYear = currentYearIndex - 1;

					while (checkYear >= 0 && !foundSemester) {
						const previousYear = years[checkYear];
						if (previousYear && previousYear.semester.length > 0) {
							const lastSemOfPrevYear = previousYear.semester[previousYear.semester.length - 1];

							if (lastSemOfPrevYear.term) {
								const isCompleted = lastSemOfPrevYear.complete;

								if (isCompleted) {
									// If the previous semester is completed, use current date
									const currentDate = new Date();
									const currentYear = currentDate.getFullYear();
									const currentMonth = currentDate.getMonth() + 1;

									if (semester.sem_type === "Short Semester") {
										if (currentMonth < 7) {
											nextIntakeMonth = "Jul";

											nextIntakeYear = currentYear;
										} else {
											nextIntakeMonth = "Jan";
											nextIntakeYear = currentYear + 1;
										}
									} else {
										if (currentMonth < 9) {
											nextIntakeMonth = "Aug/Sept";

											nextIntakeYear = currentYear;
										} else {
											nextIntakeMonth = "Feb/Mar";
											nextIntakeYear = currentYear + 1;
										}
									}
								} else {
									// Regular sequencing
									nextIntakeYear = lastSemOfPrevYear.term.Year;
									const lastIntakeMonth = lastSemOfPrevYear.term.Month;

									if (semester.sem_type === "Short Semester") {
										if (lastIntakeMonth < 6) {
											nextIntakeMonth = "Jul";
										} else {
											nextIntakeMonth = "Jan";
											nextIntakeYear++;
										}
									} else {
										if (lastIntakeMonth < 6) {
											nextIntakeMonth = "Aug/Sept";
										} else {
											nextIntakeMonth = "Feb/Mar";
											nextIntakeYear++;
										}
									}
								}
								foundSemester = true;
							}
						}
						checkYear--;
					}

					// If no semester found in previous years, use current date
					if (!foundSemester) {
						nextIntakeYear = new Date().getFullYear();
						const currentMonth = new Date().getMonth() + 1;

						if (semester.sem_type === "Short Semester") {
							nextIntakeMonth = currentMonth < 6 ? "Jan" : "Jul";
						} else {
							nextIntakeMonth = currentMonth < 6 ? "Feb/Mar" : "Aug/Sept";
						}
					}
				}
			}

			// Update semester's term
			if (!semester.term) {
				semester.term = {};
			}

			semester.term.Name = nextIntakeMonth;
			semester.term.Year = nextIntakeYear;

			// Update month based on name
			if (nextIntakeMonth === "Jan") {
				semester.term.Month = 1;
			} else if (nextIntakeMonth === "Feb/Mar") {
				semester.term.Month = 2;
			} else if (nextIntakeMonth === "Jul") {
				semester.term.Month = 7;
			} else if (nextIntakeMonth === "Aug/Sept") {
				semester.term.Month = 9;
			}

			// Update semester term label
			if (semester.sem_type === "Short Semester") {
				if (nextIntakeMonth === "Jan") {
					semester.term.Term = "Summer";
				} else if (nextIntakeMonth === "Jul") {
					semester.term.Term = "Winter";
				}
			} else {
				if (nextIntakeMonth === "Feb/Mar") {
					semester.term.Term = "Semester 1";
				} else if (nextIntakeMonth === "Aug/Sept") {
					semester.term.Term = "Semester 2";
				}

				// Count total long semesters up to this point
				let totalLongSemCount = 0;
				for (let y = 0; y <= currentYearIndex; y++) {
					const year = years[y];
					for (let s = 0; s < (y === currentYearIndex ? i + 1 : year.semester.length); s++) {
						if (year.semester[s].sem_type === "Long Semester") {
							totalLongSemCount++;
						}
					}
				}
			}

			prevSem = semester;
		}

		currentYearIndex++;
	}
}

/**
 * Updates semester and year information after a year is removed
 * @param {Array} years - The array of years
 * @param {number} removedYear - Year number that was removed
 */
function UpdateYearsAfterRemoval(years, removedYear) {
	// Start from the year that would have come after the removed year
	const startYearIndex = years.findIndex(y => y.year === removedYear);

	// If there are no years after the removed one, nothing to update
	if (startYearIndex === -1) return;

	// Find previous semester to determine next scheduling
	let prevSem = null;
	let prevSemIsCompleted = false;

	// Look for the last semester in the previous year
	if (startYearIndex > 0) {
		const previousYear = years[startYearIndex - 1];
		if (previousYear && previousYear.semester.length > 0) {
			prevSem = previousYear.semester[previousYear.semester.length - 1];
			prevSemIsCompleted = prevSem && prevSem.complete;
		}
	}

	// Flag to use current date only for the first semester after completed
	let firstSemAfterCompleted = true;

	// Recalculate all semesters starting from the current year
	let currentYearIndex = startYearIndex;

	while (currentYearIndex < years.length) {
		const currentYear = years[currentYearIndex];

		for (let i = 0; i < currentYear.semester.length; i++) {
			const semester = currentYear.semester[i];
			let nextIntakeMonth;
			let nextIntakeYear;

			// If this is the first semester after a completed semester, use current date
			if (prevSemIsCompleted && firstSemAfterCompleted) {
				// Use current date to determine next scheduling
				const currentDate = new Date();
				const currentYear = currentDate.getFullYear();
				const currentMonth = currentDate.getMonth() + 1;

				if (semester.sem_type === "Short Semester") {
					if (currentMonth < 7) {
						nextIntakeMonth = "Jul";
						nextIntakeYear = currentYear;
					} else {
						nextIntakeMonth = "Jan";
						nextIntakeYear = currentYear + 1;
					}
				} else {
					if (currentMonth < 9) {
						nextIntakeMonth = "Aug/Sept";
						nextIntakeYear = currentYear;
					} else {
						nextIntakeMonth = "Feb/Mar";
						nextIntakeYear = currentYear + 1;
					}
				}

				// Only do this for the first semester
				firstSemAfterCompleted = false;
			} else if (prevSem && prevSem.term) {
				const lastIntakeMonth = prevSem.term.Month;
				nextIntakeYear = prevSem.term.Year;

				if (semester.sem_type === "Short Semester") {
					if (lastIntakeMonth < 6) {
						nextIntakeMonth = "Jul";
					} else {
						nextIntakeMonth = "Jan";
						nextIntakeYear++;
					}
				} else {
					if (lastIntakeMonth < 6) {
						nextIntakeMonth = "Aug/Sept";
					} else {
						nextIntakeMonth = "Feb/Mar";
						nextIntakeYear++;
					}
				}
			} else {
				// No previous semester, use current date
				const currentDate = new Date();
				nextIntakeYear = currentDate.getFullYear();
				const currentMonth = currentDate.getMonth() + 1;

				if (semester.sem_type === "Short Semester") {
					if (currentMonth < 7) {
						nextIntakeMonth = "Jul";
						nextIntakeYear = currentYear;
					} else {
						nextIntakeMonth = "Jan";
						nextIntakeYear = currentYear + 1;
					}
				} else {
					if (currentMonth < 9) {
						nextIntakeMonth = "Aug/Sept";
						nextIntakeYear = currentYear;
					} else {
						nextIntakeMonth = "Feb/Mar";
						nextIntakeYear = currentYear + 1;
					}
				}
			}

			// Update semester's term
			if (!semester.term) {
				semester.term = {};
			}

			semester.term.Name = nextIntakeMonth;
			semester.term.Year = nextIntakeYear;

			// Update month based on name
			if (nextIntakeMonth === "Jan") {
				semester.term.Month = 1;
			} else if (nextIntakeMonth === "Feb/Mar") {
				semester.term.Month = 2;
			} else if (nextIntakeMonth === "Jul") {
				semester.term.Month = 7;
			} else if (nextIntakeMonth === "Aug/Sept") {
				semester.term.Month = 9;
			}

			// Update semester term label
			if (semester.sem_type === "Short Semester") {
				if (nextIntakeMonth === "Jan") {
					semester.term.Term = "Summer";
				} else if (nextIntakeMonth === "Jul") {
					semester.term.Term = "Winter";
				}
			} else {
				if (nextIntakeMonth === "Feb/Mar") {
					semester.term.Term = "Semester 1";
				} else if (nextIntakeMonth === "Aug/Sept") {
					semester.term.Term = "Semester 2";
				}

				// Count total long semesters up to this point
				let totalLongSemCount = 0;
				for (let y = 0; y <= currentYearIndex; y++) {
					const year = years[y];
					for (let s = 0; s < (y === currentYearIndex ? i + 1 : year.semester.length); s++) {
						if (year.semester[s].sem_type === "Long Semester") {
							totalLongSemCount++;
						}
					}
				}
			}

			prevSem = semester;
		}

		currentYearIndex++;
	}
}

function GetSemesterLabel(semType, month) {
	if (semType === "Long Semester") {
		if (month < 6) {
			return "Semester 1";
		} else {
			return "Semester 2";
		}
	} else if (semType === "Short Semester") {
		if (month < 6) {
			return "Summer";
		} else {
			return "Winter";
		}
	}
	return "Unknown";
}

function GetSemesterName(semType, month) {
	if (semType === "Long Semester") {
		return month < 6 ? "Feb/Mar" : "Aug/Sept";
	} else if (semType === "Short Semester") {
		return month < 6 ? "Jan" : "Jul";
	}
	return "Unknown";
}

function GetSemesterBasedOnPrevMonth(prev_month, current_sem_type) {
	if (prev_month > 6) {
		if (current_sem_type == "Long Semester") {
			return "Feb/Mar"
		} else {
			return "Jan"
		}
	} else {
		if (current_sem_type == "Long Semester") {
			return "Aug/Sept"
		} else {
			return "Jul"
		}
	}
}

function IsMoreRecentSemester(term1, term2) {
	// First compare years
	if (term1.Year > term2.Year) return true;
	if (term1.Year < term2.Year) return false;
	// If years are equal, compare semester types
	// Assuming SemType is something like 1 (Semester1), 2 (Semester2), 3 (Summer), 3 (Winter)
	return term1.SemType > term2.SemType;
}

/**
 * Find the latest term in the years structure
* Returns an object with Year, Month, SemType
* @param {Array} years - The years structure
* @returns {Object} - Latest term details or current date defaults
*/
function FindLatestTerm(years, sem_type) {
	// Default values based on current date
	const currentDate = new Date();
	const currentYear = currentDate.getFullYear();
	const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-indexed
	// Set default term based on specified sem_type
	let latestTerm = {
		Year: currentYear,
		Month: currentMonth,
		SemType: sem_type || "Long Semester" // Default to Long Semester if not specified
	};
	// Adjust default month based on sem_type
	if (sem_type === "Short Semester") {
		// Default months for short semesters: January (1) or July (7)
		if (currentMonth > 4 && currentMonth < 10) {
			latestTerm.Month = 7; // Next short semester is July
		} else {
			latestTerm.Month = 1; // Next short semester is January of next year
			latestTerm.Year = currentYear + 1;
		}
	} else {
		// Default to Long Semester behavior
		//Between 6 and 12, because the next intake would be Septenber of the same year
		//Cannot go over 12, because the semester has ended at December already
		if (currentMonth >= 6 && currentMonth < 12) {
			latestTerm.Month = 9; // Next long semester is September
		} else {
			latestTerm.Month = 2; // Next long semester is February of next year
			if (currentMonth >= 6 && currentMonth <= 12) {
				latestTerm.Year = currentYear + 1;
			}
		}
	}
	let foundLatestTerm = false;
	let allComplete = true;
	// Look through all years and semesters to find the latest term of the specified type
	for (let y = 0; y < years.length; y++) {
		for (let s = 0; s < years[y].semester.length; s++) {
			const semester = years[y].semester[s];
			if (semester.term && semester.units.length > 0 &&
				(!sem_type || semester.term.SemType === sem_type)) {
				const termIsAfterCurrent =
					semester.term.Year > currentYear ||
					(semester.term.Year === currentYear && semester.term.Month >= currentMonth);
				const termIsEarlierThanLatest =
					!foundLatestTerm ||
					semester.term.Year < latestTerm.Year ||
					(semester.term.Year === latestTerm.Year && semester.term.Month < latestTerm.Month);
				if (termIsAfterCurrent && termIsEarlierThanLatest) {
					latestTerm = {
						Year: semester.term.Year,
						Month: semester.term.Month,
						SemType: semester.term.SemType
					};
					foundLatestTerm = true;
					if (!semester.complete) {
						allComplete = false;
					}
				}
			}
		}
	}
	// Always return a valid term object
	return latestTerm;
}

/**
* Get the next term after the provided one
* @param {Object} currentTerm - Object with Year, Month, SemType
* @returns {Object} - Next term details
*/
function GetNextTerm(currentTerm, nextSemester = null) {
	if (!currentTerm) {
		// Return a default term if currentTerm is null/undefined
		const currentDate = new Date();
		const currentYear = currentDate.getFullYear();
		const currentMonth = currentDate.getMonth() + 1;
		return {
			Year: currentMonth < 9 ? currentYear : currentYear + 1,
			Month: currentMonth < 9 ? 9 : 2,
			SemType: "Long Semester"
		};
	}
	// If nextSemester is provided and has a term, use that
	if (nextSemester && nextSemester.term) {
		return {
			Year: nextSemester.term.Year,
			Month: nextSemester.term.Month,
			SemType: nextSemester.term.SemType
		};
	}
	// Otherwise calculate the next term based on current term
	let next_term = { ...currentTerm };
	const currentSemType = currentTerm.SemType ? currentTerm.SemType.toString().toLowerCase() : "long semester";
	if (currentSemType === "long semester") {
		if (currentTerm.Month < 6) {
			next_term.Month = 9;
		} else {
			next_term.Month = 2;
			next_term.Year = currentTerm.Year + 1;
		}
	}
	else if (currentSemType === "short semester") {
		if (currentTerm.Month < 6) {
			next_term.Month = 2;
			next_term.SemType = "Long Semester";
		} else {
			next_term.Month = 9;
			next_term.SemType = "Long Semester";
		}
	}
	else {
		// Default behavior for unknown semester types
		next_term.Month = currentTerm.Month < 6 ? 9 : 2;
		if (next_term.Month < currentTerm.Month) {
			next_term.Year = currentTerm.Year + 1;
		}
		next_term.SemType = "Long Semester";
	}
	return next_term;
}

function CheckIsUnitOffered(unit_code, term) {
	const unit_term_offered = unit_term_offered_arr.find(unit => unit.unit_code == unit_code && unit.term_type == term)
	return unit_term_offered ? true : false
}

function GetSemesterTermBasedOnPrevMonth(prev_month, current_sem_type) {
	if (prev_month > 6) {
		if (current_sem_type == "Long Semester") {
			return "Semester 1"
		} else {
			return "Summer"
		}
	} else {
		if (current_sem_type == "Long Semester") {
			return "Semester 2"
		} else {
			return "Winter"
		}
	}
}

function AddCompletedUnitIntoYears(completed_units, years, last_sem_fail_unit_count) {
	let last_completed_semester = null;

	for (let y = 0; y < completed_units.length; y++) {
		const year_entry = completed_units[y];
		for (let t = 0; t < year_entry.terms.length; t++) {
			const term_entry = year_entry.terms[t];
			let current_sem_fail_count = 0;
			// Find matching year in years structure or create it if it doesn't exist
			let matching_year = years.find(year => year.year === year_entry.year);
			if (!matching_year) {
				matching_year = {
					year: year_entry.year,
					semester: []
				};
				years.push(matching_year);
			}
			// Find matching semester in the year or create it if it doesn't exist
			let semester = matching_year.semester.find(semester =>
				semester.sem_type === term_entry.term.SemType &&
				(!semester.term || semester.term.ID === term_entry.term.ID)
			);
			//If semester does not exist
			if (!semester) {
				//Semester object
				semester = {
					sem_type: term_entry.term.SemType,
					units: [],
					term: {
						Name: term_entry.term.Name,
						Year: term_entry.term.Year,
						SemType: term_entry.term.SemType,
						Month: term_entry.term.Month,
						Term: GetSemesterLabel(term_entry.term.SemType, term_entry.term.Month)
					}
				};
				// Find the correct index to insert the semester based on chronological order
				let insertIndex = 0;
				while (insertIndex < matching_year.semester.length &&
					(matching_year.semester[insertIndex].term &&
						(matching_year.semester[insertIndex].term.Year < term_entry.term.Year ||
							(matching_year.semester[insertIndex].term.Year === term_entry.term.Year &&
								matching_year.semester[insertIndex].term.Month <= term_entry.term.Month)))) {
					insertIndex++;
				}
				matching_year.semester.splice(insertIndex, 0, semester);
			} else if (semester.units.length === 0) {
				// If this is the first unit being added to an existing semester, update the term information
				semester.term = {
					ID: term_entry.term.ID,
					Name: term_entry.term.Name,
					Year: term_entry.term.Year,
					SemType: term_entry.term.SemType,
					Month: term_entry.term.Month,
					Term: GetSemesterLabel(term_entry.term.SemType, term_entry.term.Month)
				};
			}

			// Add all units from this term to the semester
			for (let u = 0; u < term_entry.units.length; u++) {
				const unit = term_entry.units[u];

				if (unit.status == 'fail') {
					current_sem_fail_count++;
				}

				// Create a copy of the unit without the term property
				const unitWithoutTerm = { ...unit };
				delete unitWithoutTerm.term;
				semester.units.push(unitWithoutTerm);
			}

			semester.complete = true;
			// Update last semester info if this is the most recent completed semester
			if (!last_completed_semester || IsMoreRecentSemester(term_entry.term, last_completed_semester.term)) {
				last_completed_semester = semester;
				last_sem_fail_unit_count = current_sem_fail_count;
			}
		}
	}

	return last_sem_fail_unit_count;
}

function AddUncompletedUnitIntoYears(uncompleted_units, years, last_sem_fail_unit_count = 0) {
	let latest_term = null;
	let next_term = null;
	let first_run = false;
	for (let x = 0; x < uncompleted_units.length; x++) {
		// Find the next available slot in the years structure
		let unit_added = false;
		// Try to add to existing years first
		for (let y = 0; y < years.length && !unit_added; y++) {
			// Check each semester in the current year
			for (let s = 0; s < years[y].semester.length && !unit_added; s++) {
				const current_sem = years[y].semester[s];

				if (current_sem.complete) {
					// Skip completed semesters
					continue;
				}
				// Skip this semester if it contains any units with status != 'planned'
				// This prevents mixing completed/failed units with new planned units
				const has_non_planned_units = current_sem.units.some(unit =>
					unit.status && unit.status.toLowerCase() !== 'planned'
				);
				if (has_non_planned_units) {
					continue;
				}
				// Calculate max units: base count (4) + failed units from previous semesters
				const base_unit_count = current_sem.unit_count || 4;
				let max_unit_count = base_unit_count;

				// Commented out to handle the case where last semester failed units are not considered
				// if (last_sem_fail_unit_count <= 1) {
				// 	max_unit_count = base_unit_count + last_sem_fail_unit_count;
				// }

				// If the semester has fewer than max units, add to it
				if (current_sem.units.length < max_unit_count) {
					// Create a default term if none exists
					if (!current_sem.term) {
						if (!first_run) {
							next_term = FindLatestTerm(years, current_sem.sem_type);
							first_run = true;
							current_sem.term = {
								Name: GetSemesterName(next_term.SemType, next_term.Month),
								Year: next_term.Year,
								SemType: next_term.SemType,
								Month: next_term.Month,
								Term: GetSemesterLabel(next_term.SemType, next_term.Month)
							};
						} else {
							let prev_sem = null;
							if (s > 0) {
								prev_sem = years[y].semester[s - 1];
							} else if (y > 0 && years[y - 1].semester.length > 0) {
								prev_sem = years[y - 1].semester[years[y - 1].semester.length - 1];
							}
							if (prev_sem && prev_sem.term) {
								// Calculate next term based on prev_sem
								const next_term = {
									Year: prev_sem.term.SemType === "Short Semester" && prev_sem.term.Month < 6 ?
										prev_sem.term.Year :
										(prev_sem.term.Month < 9 ? prev_sem.term.Year : prev_sem.term.Year + 1),
									Month: prev_sem.term.SemType === "Short Semester" ?
										(prev_sem.term.Month < 6 ? 2 : 9) :
										(prev_sem.term.Month < 9 ? 9 : 2),
									SemType: "Long Semester"
								};
								// Set current_sem term properties
								current_sem.term = {
									Name: GetSemesterBasedOnPrevMonth(prev_sem.term.Month, current_sem.sem_type),
									Year: next_term.Year,
									SemType: next_term.SemType,
									Month: next_term.Month,
									Term: GetSemesterTermBasedOnPrevMonth(prev_sem.term.Month, current_sem.sem_type)
								};
							}
						}
					}
					if (uncompleted_units[x].unit_type._name.toLowerCase().includes('elective')) {
						if (!uncompleted_units[x].unit.code) {
							uncompleted_units[x].is_offered = true;
						} else {
							uncompleted_units[x].is_offered = CheckIsUnitOffered(uncompleted_units[x].unit.code, current_sem.term.Term)
						}
					} else {
						uncompleted_units[x].is_offered = CheckIsUnitOffered(uncompleted_units[x].unit.code, current_sem.term.Term)
					}
					current_sem.units.push({
						...uncompleted_units[x],
						year: years[y].year,
						status: "planned" // Mark as planned since it's uncompleted
					});
					unit_added = true;
					break; // Break out of semester loop to move to next unit
				} else {
					last_sem_fail_unit_count = 0;
				}
			}
		}

		// If unit couldn't be added to existing years/semesters, create a new structure
		if (!unit_added) {
			// Get the last year number
			const last_year_index = years.length - 1;
			const next_year_number = last_year_index >= 0 ? years[last_year_index].year + 1 : 1;
			// Get the next two terms in sequence based on the latest term
			const next_term1 = GetNextTerm(latest_term);
			latest_term = next_term1; // Update latest term
			const next_term2 = GetNextTerm(latest_term);
			latest_term = next_term2; // Update latest term again for future units
			// Force correction: If next_term1 is a Summer Short Semester (Jan), ensure next_term2 is Feb/Mar
			if (next_term1.SemType.toLowerCase() === "short semester" && next_term1.Month < 6) {
				// Set next_term2 to be February/March of the same year
				next_term2.Month = 2;
				next_term2.Year = next_term1.Year;
				next_term2.SemType = "Long Semester";
				// Also update latest_term since it's used for subsequent iterations
				latest_term = next_term2;
			}
			// Find the latest year that has at least one semester with incomplete units
			let target_year = null;
			let target_semester = null;
			// Look for an existing semester with only planned units to use
			for (let y = years.length - 1; y >= 0; y--) {
				for (let s = years[y].semester.length - 1; s >= 0; s--) {
					const semester = years[y].semester[s];
					// Skip empty semesters or semesters with no term
					if (!semester.term || semester.units.length === 0) {
						continue;
					}
					// Only consider semesters that have only planned units
					const has_non_planned_units = semester.units.some(unit =>
						unit.status && unit.status.toLowerCase() !== 'planned'
					);
					if (!has_non_planned_units && semester.units.length < (semester.unit_count || 4)) {
						target_year = y;
						target_semester = s;
						break;
					}
				}
				if (target_year !== null) break;
			}
			// If we found a suitable semester, use it
			if (target_year !== null && target_semester !== null) {
				years[target_year].semester[target_semester].units.push({
					...uncompleted_units[x],
					year: years[target_year].year,
					status: "planned"
				});
			} else {
				// Create a new year with new semesters if no suitable semester was found
				const new_year = {
					year: next_year_number,
					semester: [
						{
							sem_type: next_term1.SemType,
							unit_count: 4,
							term: {
								Name: GetSemesterName(next_term1.SemType, next_term1.Month),
								Year: next_term1.Year,
								SemType: next_term1.SemType,
								Month: next_term1.Month,
								Term: GetSemesterLabel(next_term1.SemType, next_term1.Month)
							},
							units: [
								{
									...uncompleted_units[x],
									year: next_year_number,
									status: "planned"
								}
							]
						},
						{
							sem_type: next_term2.SemType,
							unit_count: 4,
							term: {
								Name: GetSemesterName(next_term2.SemType, next_term2.Month),
								Year: next_term2.Year,
								SemType: next_term2.SemType,
								Month: next_term2.Month,
								Term: GetSemesterLabel(next_term2.SemType, next_term2.Month)
							},
							units: []
						}
					]
				};
				years.push(new_year);
			}
		}
	}
}

async function ApplyAmendments(amendments, years, student_cp, required_cp) {
	console.log('🔄 ApplyAmendments starting with', amendments.length, 'amendments');
	let student_cp_in_planner = student_cp;
	for (const amendment of amendments) {
		const old_unit_code = amendment._unit_code
		const new_unit_code = amendment._new_unit_code
		const action = amendment._action
		const new_unit_type = amendment._new_unit_type_id
		const sem_type = amendment._sem_type;
		const sem_id = amendment._sem_id;
		const unit_id = amendment._unit_id;
		const new_unit_id = amendment._new_unit_id;
		const old_unit_type_id = amendment._old_unit_type_id;
		const new_unit_type_id = new_unit_type;

		// Determine year and sem_index based on whether sem_id is available
		let year, sem_index;
		if (sem_id) {
			// Find the semester by sem_id
			const semester = years.find(y =>
				y.semester && y.semester.some(sem => sem.sem_id === sem_id)
			)?.semester.find(sem => sem.sem_id === sem_id);

			if (!semester) {
				console.warn(`Semester with ID ${sem_id} not found in years structure`);
				continue;
			}

			// Find the year and semester index
			const yearObj = years.find(y =>
				y.semester && y.semester.some(sem => sem.sem_id === sem_id)
			);
			year = yearObj.year;
			sem_index = yearObj.semester.findIndex(sem => sem.sem_id === sem_id);
		} else {
			// Use year and sem_index from amendment
			year = amendment._year;
			sem_index = amendment._sem_index;
		}

		if (amendment.has_applied) {
			continue;
		}
		let is_old_unit_elective = false;
		if (old_unit_type_id) {
			is_old_unit_elective = getUnitTypeInfo(old_unit_type_id).name.toLowerCase() === "elective";
		}

		//Only changed unit type can affect completed units/semesters
		if (action === 'changed_type') {
			const unit_type = getUnitTypeInfo(new_unit_type)
			const old_unit_id = amendment._unit_id;
			const new_unit_id = amendment._new_unit_id;

			const type_obj = {
				_type_id: new_unit_type,
				_name: unit_type.name,
				_color: unit_type.color,
			}
			let unit_pos = null;
			let include_pass = false

			// Try to find by year/semester and unit_id first (most reliable for completed semesters)
			const yearObj = years.find(y => y.year === year);
			if (yearObj && yearObj.semester && yearObj.semester[sem_index]) {
				const semester = yearObj.semester[sem_index];

				// For changed_type with unit_id, find by ID
				if (old_unit_id) {
					if (semester.units) {
						const unitIndex = semester.units?.findIndex(u => u?.unit?.unit_id === old_unit_id);
						if (unitIndex !== -1) {
							console.log('Found unit by ID at index:', unitIndex);
							semester.units[unitIndex].unit_type = type_obj;
							amendment.has_applied = true;
							console.log('Marked changed_type amendment as applied');
							continue;
						} else {
							console.log('Could not find unit with ID:', old_unit_id);
						}
					}
				}

				// Fallback: search by unit code
				const search_code = new_unit_code || old_unit_code;
				if (search_code) {
					const unitIndex = semester.units.findIndex(u => u.unit?.code === search_code);
					if (unitIndex !== -1) {
						console.log('Found unit by code at index:', unitIndex);
						semester.units[unitIndex].unit_type = type_obj;
						amendment.has_applied = true;
						console.log('Marked changed_type amendment as applied');
						continue;
					}
				}
			}

			// Old logic as final fallback
			const search_code = new_unit_code || old_unit_code;
			if (search_code) {
				if (IsSemesterCompleted(years, year, sem_index)) {
					include_pass = true;
				} else {
					include_pass = false;
				}
				unit_pos = GetUnitPosition(years, search_code, include_pass)
			}

			if (unit_pos) {
				console.log('Found unit, updating type at position:', unit_pos)
				years.find(y => y.year === unit_pos.year).semester[unit_pos.semesterIndex].units[unit_pos.unitIndex].unit_type = type_obj
			} else {
				while (!years.find(y => y.year === year)) {
					AddNewYear(years, year);
				}
				let year_obj = years.find(y => y.year === year);
				while (!year_obj.semester[sem_index]) {
					AddNewSemesterInYear(years, year_obj, sem_index, sem_type);
				}
				const get_empty_unit_slot = GetUnitIndexByYearandSem(years, year, sem_index, new_unit_code, false, true)
				if (get_empty_unit_slot == -1) {
					const unit_obj = {
						unit_type: type_obj,
						unit: {
							code: null,
							name: null,
							credit_points: 0,
						},
						requisites: [],
						has_conflict: false,
						is_offered: true,
						year: year,
						status: 'planned'
					}
					years.find(y => y.year === year).semester[sem_index].units.push(unit_obj)
				} else {
					years.find(y => y.year === year).semester[sem_index].units[get_empty_unit_slot].unit_type = type_obj
				}
			}
			amendment.has_applied = true;
			console.log('Marked changed_type amendment as applied');
			continue;
		}
		if (action === 'deleted') {
			const unit_pos = {
				year: year,
				semesterIndex: sem_index,
				unitIndex: GetUnitIndexByYearandSem(years, year, sem_index, old_unit_code, false)
			}
			if (unit_pos.unitIndex !== -1) {
				years.find(y => y.year === unit_pos.year).semester[unit_pos.semesterIndex].units.splice(unit_pos.unitIndex, 1);
			} else if (is_old_unit_elective && new_unit_id === null) {
				DeleteAnyAvailableElectiveInPlanner(years);
			}

			if (years.find(y => y.year === unit_pos.year).semester[unit_pos.semesterIndex].units.length == 0) {
				years.find(y => y.year === unit_pos.year).semester.splice(unit_pos.semesterIndex, 1);
			}
			amendment.has_applied = true;
			continue;
		}
		if (action === 'replaced') {
			if (new_unit_code && new_unit_id) {
				//Check if the new unit is already in the planner
				const new_unit_pos = GetUnitPosition(years, new_unit_code, true, false, false, new_unit_id);

				//If it already exist, find the position of the old unit and remove it
				if (new_unit_pos) {
					const new_units_sem = years
						.find(y => y.year === new_unit_pos.year)
						.semester[new_unit_pos.semesterIndex];
					const is_new_unit_elective = new_units_sem.units[new_unit_pos.unitIndex].unit_type._name.toLowerCase() == "elective";

					//Find the old unit position and try to remove it, old unit position could be possible to not exist as well (old_unit_code = null), or an elective
					if (old_unit_code) {
						const old_unit_pos = GetUnitPosition(years, old_unit_code, true, old_unit_type_id == null, is_old_unit_elective, unit_id);
						if (old_unit_pos) {
							const old_unit_sem = years
								.find(y => y.year === old_unit_pos.year)
								.semester[old_unit_pos.semesterIndex];

							old_unit_sem.units.splice(old_unit_pos.unitIndex, 1);
						}
						if (new_unit_type_id) {
							const new_unit_type_obj = getUnitTypeInfo(new_unit_type_id);
							//Update the new unit type
							new_units_sem.units[new_unit_pos.unitIndex].unit_type = {
								_type_id: new_unit_type_obj?.type_id ?? null,
								_name: new_unit_type_obj?.name ?? null,
								_color: new_unit_type_obj?.color ?? null,
							}
						}
					}
					if (is_new_unit_elective && !is_old_unit_elective) {
						if (student_cp_in_planner <= required_cp) {
							if (AddElectiveToAvailableSemesters(years)) {
								student_cp_in_planner = student_cp_in_planner + 12.5;
							}
						}
					}
				} else {
					const new_unit_data_res = await UnitDB.FetchUnits({ id: new_unit_id });
					const new_unit_type_obj = getUnitTypeInfo(new_unit_type_id);
					const new_unit_data = new_unit_data_res.data[0];
					const new_unit_obj = {
						unit_type: {
							_type_id: new_unit_type_obj?.type_id ?? null,
							_name: new_unit_type_obj?.name ?? null,
							_color: new_unit_type_obj?.color ?? null,
						},
						unit: {
							unit_id: new_unit_data.id ?? null,
							availability: new_unit_data.availability,
							code: new_unit_data.unit_code ?? null,
							name: new_unit_data.name ?? null,
							credit_points: new_unit_data.credit_points ?? 0,
						},
						requisites: new_unit_data.requisites ?? null,
						has_conflict: false,
						is_offered: true,
						year: year,
						status: 'planned'
					}

					//Find the old unit and replace it with the new one

					let old_unit_pos = null;
					// idk why i comment this bro, idk why i have this here??? Maybe it is useful idk, future developer goodluck - 25/11/2025
					// old_unit_pos = {
					// 	year: year,
					// 	semesterIndex: sem_index,
					// 	unitIndex: GetUnitIndexByYearandSem(years, year, sem_index, old_unit_code)
					// }
					old_unit_pos = GetUnitPosition(years, old_unit_code, true, old_unit_type_id == null, is_old_unit_elective, unit_id);
					if (old_unit_pos) {
						const old_unit_sem = years
							.find(y => y.year === old_unit_pos.year)
							.semester[old_unit_pos.semesterIndex];

						new_unit_obj.status = old_unit_sem.units[old_unit_pos.unitIndex].status
						old_unit_sem.units[old_unit_pos.unitIndex] = new_unit_obj;
						continue;
					} else {
						EnsureUnitInPlanner(years, year, sem_index, new_unit_code, amendment, new_unit_obj, sem_type);
					}
				}
			}
			continue;
		}
		if (IsSemesterCompleted(years, year, sem_index)) {
			continue;
		}
		if (action === 'swapped') {
			const next_amendment = amendments[amendments.indexOf(amendment) + 1];

			// Determine next amendment's year and sem_index
			let next_year, next_sem_index;
			if (next_amendment && next_amendment._sem_id) {
				const nextSemester = years.find(y =>
					y.semester && y.semester.some(sem => sem.sem_id === next_amendment._sem_id)
				)?.semester.find(sem => sem.sem_id === next_amendment._sem_id);

				if (!nextSemester) {
					console.warn(`Next amendment semester with ID ${next_amendment._sem_id} not found`);
					continue;
				}

				const nextYearObj = years.find(y =>
					y.semester && y.semester.some(sem => sem.sem_id === next_amendment._sem_id)
				);
				next_year = nextYearObj.year;
				next_sem_index = nextYearObj.semester.findIndex(sem => sem.sem_id === next_amendment._sem_id);
			} else if (next_amendment) {
				next_year = next_amendment._year;
				next_sem_index = next_amendment._sem_index;
			}

			//If next amendment does not exist OR Semester Is Completed
			const shouldForceAdd = !next_amendment || IsSemesterCompleted(years, next_year, next_sem_index);
			const isValidSwap = (
				next_amendment &&
				next_amendment._action === 'swapped' &&
				new_unit_code === next_amendment._unit_code
			);
			if (shouldForceAdd || !isValidSwap) {
				EnsureUnitInPlanner(years, year, sem_index, new_unit_code, amendment);
				continue;
			}
			try {
				// Try to find the indices of both units in the planner
				const current_new_unit_index = GetUnitIndexByYearandSem(years, next_year, next_sem_index, new_unit_code, false);
				const next_amendment_new_unit_index = GetUnitIndexByYearandSem(years, year, sem_index, next_amendment._new_unit_code, false);
				if (current_new_unit_index === -1 || next_amendment_new_unit_index === -1) {
					// EnsureUnitInPlanner(years, next_year, next_sem_index, new_unit_code, amendment);
					// continue;

					console.warn('Skipping swap due to units not found in the planner:', {
						current_new_unit_index,
					});
					continue;
				}

				/* 
				if (next_amendment_new_unit_index === -1) {
					debugger;
					console.log (years, year, sem_index, next_amendment._new_unit_code, next_amendment)
					EnsureUnitInPlanner(years, year, sem_index, next_amendment._new_unit_code, next_amendment);
					EnsureUnitInPlanner(years, next_year, next_sem_index, new_unit_code, amendment);
					continue;
					// console.warn('Skipping swap due to units not found in the planner:', {
					// 	next_amendment_new_unit_index
					// });
					// continue;
				}
				*/
				// Perform the swap
				const first_year_obj = years.find(y => y.year === next_year);
				const second_year_obj = years.find(y => y.year === year);
				const temp_unit = first_year_obj.semester[next_sem_index].units[current_new_unit_index];
				first_year_obj.semester[next_sem_index].units[current_new_unit_index] = second_year_obj.semester[sem_index].units[next_amendment_new_unit_index];
				second_year_obj.semester[sem_index].units[next_amendment_new_unit_index] = temp_unit;
				// Mark both amendment as applied
				next_amendment.has_applied = true;
				amendment.has_applied = true;
			} catch (error) {
				console.error('Error swapping units:', error.message);
			}
			continue;
		}
	}
}
function AddYearDataIntoPlanner(years, student_study_planner) {
	let isFirstAfterCompleted = true;
	for (const year_entry of years) {
		student_study_planner = student_study_planner.AddNewYear();
		for (const [semesterIndex, semester] of year_entry.semester.entries()) {
			// Skip empty semesters EXCEPT for the first year and first sem
			if ((!semester.term || semester.units.length === 0) && !(year_entry.year == 1 && semesterIndex == 0)) {
				continue;
			}
			// Determine semester term label
			const sem_term = GetSemesterLabel(semester.sem_type, semester.term.Month);
			let intake_month;
			let sem_name;
			// Calculate the number of long semesters that came before this one
			let longSemesterCount = 0;
			// Count long semesters in previous years
			for (let y = 0; y < years.indexOf(year_entry); y++) {
				const prevYear = years[y];
				for (const prevSemester of prevYear.semester) {
					if (prevSemester.term && prevSemester.sem_type.toLowerCase() === "long semester") {
						longSemesterCount++;
					}
				}
			}
			// Count long semesters in current year up to current semester
			for (let s = 0; s < semesterIndex; s++) {
				const prevSemester = year_entry.semester[s];
				if (prevSemester.term && prevSemester.sem_type.toLowerCase() === "long semester") {
					longSemesterCount++;
				}
			}
			// Add 1 to get the current semester number (if this is a long semester)
			const currentSemesterNumber = longSemesterCount + 1;
			// Check if the previous semester was a Summer semester
			const prevSemester = semesterIndex > 0 ? year_entry.semester[semesterIndex - 1] : null;
			const wasPrevSummer = prevSemester &&
				prevSemester.term &&
				prevSemester.sem_type.toLowerCase() === "short semester" &&
				prevSemester.term.Month < 6;
			// Determine semester name and intake month based on type and month
			if (semester.sem_type.toLowerCase() === "long semester") {
				if (semester.term.Month < 6 || wasPrevSummer) {
					intake_month = "Feb/Mar";
					sem_name = `Semester ${currentSemesterNumber}`;
				} else {
					intake_month = "Aug/Sept";
					sem_name = `Semester ${currentSemesterNumber}`;
				}
			} else {
				intake_month = semester.term.Month < 6 ? "Jan" : "Jul";
				sem_name = semester.term.Month < 6 ? "Summer" : "Winter";
			}
			let sem_obj = null;
			if (!semester.complete) {
				sem_obj = isFirstAfterCompleted ? {
					...(semester.sem_id !== undefined && { sem_id: semester.sem_id }),
					sem_name,
					sem_term,
					sem_type: semester.sem_type,
					intake: {
						month: intake_month,
						year: semester.term.Year
					},
					...(semester.units.some(unit => unit.status && unit.status.toLowerCase() !== 'planned') && {
						sem_completed: semester.term.Name
					})
				} : {
					...(semester.sem_id !== undefined && { sem_id: semester.sem_id }),
					sem_name,
					sem_term,
					sem_type: semester.sem_type,
					intake: {
						month: intake_month,
						year: semester.term.Year
					}
				};
				isFirstAfterCompleted = false;
			} else {
				sem_obj = {
					...(semester.sem_id !== undefined && { sem_id: semester.sem_id }),
					sem_name,
					sem_term,
					sem_type: semester.sem_type,
					sem_completed: semester.term.Name,
					intake: {
						month: intake_month,
						year: semester.term.Year
					}
				};
			}
			// Add semester to planner
			student_study_planner = student_study_planner.AddNewSemester(
				year_entry.year,
				semester.sem_type,
				sem_obj,
				false,
				false
			);
			// Add units to the semester
			for (const [unitIndex, unit] of semester.units.entries()) {
				// Add new unit row
				student_study_planner = student_study_planner.AddNewUnitRowIntoSemester(
					year_entry.year,
					semesterIndex
				);
				let is_unit_offered = true;
				if (unit.status === 'planned') {
					is_unit_offered = CheckIsUnitOffered(unit.unit?.code, GetSemesterTerm(student_study_planner.years, year_entry.year, semesterIndex));
				}
				// Create unit object with proper properties
				const unit_obj = {
					unit_id: unit.unit.unit_id,
					unit_code: unit.unit?.code || null,
					unit_name: unit.unit?.name || null,
					unit_cp: unit.unit?.credit_points ?? 12.5,
					unit_requisites: unit.requisites || [],
					unit_type: unit.unit_type || null,
					is_offered: is_unit_offered,
					unit_availability: unit.unit?.availability || null
				};
				// Add unit to planner
				student_study_planner = student_study_planner.EditUnitInUnitRow(
					year_entry.year,
					semesterIndex,
					unitIndex,
					unit_obj,
					unit.status || "planned",
					false
				);
			}
		}
	}
	return student_study_planner;
}

function FindUnitInPlanner(planner, unit_code) {
	for (const year of planner.years) {
		for (let sem_idx = 0; sem_idx < year.semesters.length; sem_idx++) {
			const semester = year.semesters[sem_idx];
			for (let unit_idx = 0; unit_idx < semester.units.length; unit_idx++) {
				const unit = semester.units[unit_idx];
				if (unit.unit?.code === unit_code) {
					return {
						year: year.year,
						sem_index: sem_idx,
						unit_index: unit_idx,
						sem_type: semester.sem_type
					};
				}
			}
		}
	}
	return null;
}

/**
* Detect the type of conflict for a unit
*/
function DetectConflictType(unit, completed_codes, planner, year_num, sem_index, completed_units) {
	// Check availability first
	if (!unit.is_offered) {
		return 'availability';
	}
	// Check if requisites are met
	if (!CheckRequisiteMet(unit, completed_codes, planner, year_num, sem_index, completed_units)) {
		// Determine which type of requisite is causing the conflict
		if (unit.requisites && unit.requisites.length > 0) {
			for (const req of unit.requisites) {
				switch (req._unit_relationship?.toLowerCase()) {
					case 'pre':
						if (!EvaluatePrerequisite(req, completed_codes)) {
							return 'prerequisite';
						}
						break;
					case 'co':
						if (!EvaluateCorequisite(req, completed_codes, planner, year_num, sem_index)) {
							return 'corequisite';
						}
						break;
					case 'anti':
						if (!EvaluateAntirequisite(req, planner, year_num, sem_index)) {
							return 'antirequisite';
						}
						break;
					case 'min':
						if (!EvaluateMinCP(req, completed_units, planner, year_num, sem_index)) {
							return 'min_cp';
						}
						break;
				}
			}
		}
		return 'prerequisite'; // Default fallback
	}
	return 'none';
}

/**
* Find available units that can be swapped with the conflicting unit
*/
function FindAvailableUnitsForSwap(planner, year_num, sem_index, unit_index, completed_codes, units_offered, completed_units) {
	const available_units = [];
	// Look through all semesters for units that could be swapped
	planner.years.forEach((year, year_idx) => {
		year.semesters.forEach((sem, sem_idx) => {
			// Skip the current semester
			if (year.year === year_num && sem_idx === sem_index) return;
			sem.units.forEach((unit, unit_idx) => {
				// Skip completed semesters
				if (sem.sem_completed) return;
				// Check if this unit's prerequisites are met in its current position AND if it is offered in this semester
				if (
					CheckRequisiteMet(unit, completed_codes, planner, year.year, sem_idx, completed_units) &&
					CheckUnitOffering(unit, sem.sem_term, units_offered)
				) {
					available_units.push({
						year: year.year,
						sem_index: sem_idx,
						unit_index: unit_idx,
						unit: unit.unit,
						unit_type: unit.unit_type,
						sem_type: sem.sem_type,
						sem_id: sem.sem_id
					});
				}
			});
		});
	});
	// Sort by preference (electives first, then by unit type)
	available_units.sort((a, b) => {
		const a_is_elective = a.unit.unit_type?._name?.toLowerCase().includes('elective');
		const b_is_elective = b.unit.unit_type?._name?.toLowerCase().includes('elective');
		if (a_is_elective && !b_is_elective) return -1;
		if (!a_is_elective && b_is_elective) return 1;
		return 0;
	});
	return available_units;
}

/**
* Check if a unit's prerequisites are met
*/
function CheckRequisiteMet(unit, completed_codes, planner = null, target_year = null, target_sem_index = null, completed_units) {
	if (!unit.requisites || unit.requisites.length === 0) return true;
	// Group requisites by operator for complex evaluation
	const requisiteGroups = GroupRequisitesByOperator(unit.requisites);
	// Evaluate each group
	for (const group of requisiteGroups) {
		if (!EvaluateRequisiteGroup(group, completed_codes, planner, target_year, target_sem_index, completed_units)) {
			return false;
		}
	}
	return true;
}

function GetSemesterTerm(years, year, sem_index) {
	const yearObj = years.find(y => y.year === year);
	if (!yearObj) return null;
	const semester = yearObj.semesters[sem_index];
	if (!semester) return null;

	return semester.sem_term;
}

/**
 * Check if a unit is offered in a specific term
 */
function CheckUnitOffering(unit, term_type, units_offered) {
	if (!unit.unit?.code) return true; // Elective units are always considered offered

	return units_offered.some(uo =>
		uo.unit_id === unit.unit.unit_id && uo._term_type === term_type
	);
}

/**
* Evaluate a single requisite
*/
function EvaluateSingleRequisite(req, completed_codes, planner, target_year, target_sem_index, completed_units) {
	switch (req._unit_relationship?.toLowerCase()) {
		case 'pre':
			return EvaluatePrerequisite(req, completed_codes);
		case 'co':
			return EvaluateCorequisite(req, completed_codes, planner, target_year, target_sem_index);
		case 'anti':
			return EvaluateAntirequisite(req, planner, target_year, target_sem_index);
		case 'min':
			return EvaluateMinCP(req, completed_units, planner, target_year, target_sem_index);
		default:
			return true;
	}
}

/**
 * Group requisites by operator (AND/OR)
 */
function GroupRequisitesByOperator(requisites) {
	const groups = [];
	let currentGroup = {
		operator: 'or',
		requisites: []
	};

	for (const req of requisites) {
		if (req._operator?.toLowerCase() === 'and') {
			// if (req._operator?.toLowerCase() === 'and' && currentGroup.requisites.length > 0) {
			// Start a new group for AND
			groups.push(currentGroup);
			currentGroup = {
				operator: 'and',
				requisites: [req]
			};
		} else {
			currentGroup.requisites.push(req);
		}
	}

	// Add the last group
	if (currentGroup.requisites.length > 0) {
		groups.push(currentGroup);
	}

	return groups;
}

/**
* Evaluate a group of requisites with the same operator
*/
function EvaluateRequisiteGroup(group, completed_codes, planner, target_year, target_sem_index, completed_units) {
	const results = group.requisites.map(req =>
		EvaluateSingleRequisite(req, completed_codes, planner, target_year, target_sem_index, completed_units)
	);
	if (group.operator === 'and') {
		// All requisites must be satisfied
		return results.every(result => result);
	} else {
		// At least one requisite must be satisfied (OR)
		return results.some(result => result);
	}
}

/**
* Evaluate prerequisite (must be completed before)
*/
function EvaluatePrerequisite(req, completed_codes) {
	if (!req._requisite_unit_code) return true;
	return completed_codes.includes(req._requisite_unit_code);
}

/**
* Evaluate corequisite (must be taken together or before)
*/
function EvaluateCorequisite(req, completed_codes, planner, target_year, target_sem_index) {
	if (!req._requisite_unit_code) return true;
	// Check if already completed
	if (completed_codes.includes(req._requisite_unit_code)) {
		return true;
	}
	// Check if it's in the same semester (taken together)
	if (planner && target_year && target_sem_index !== null) {
		const target_year_obj = planner.years.find(y => y.year === target_year);
		if (target_year_obj) {
			const target_semester = target_year_obj.semesters[target_sem_index];
			if (target_semester) {
				return target_semester.units.some(unit =>
					unit.unit?.code === req._requisite_unit_code
				);
			}
		}
	}
	return false;
}

/**
 * Evaluate antirequisite (must not be taken together)
 */
function EvaluateAntirequisite(req, planner, target_year, target_sem_index) {
	if (!req._requisite_unit_code) return true;
	// Check if it's in the same semester (conflict)
	if (planner && target_year && target_sem_index !== null) {
		const target_year_obj = planner.years.find(y => y.year === target_year);
		if (target_year_obj) {
			const target_semester = target_year_obj.semesters[target_sem_index];
			if (target_semester) {
				const hasConflict = target_semester.units.some(unit =>
					unit.unit?.code === req._requisite_unit_code
				);
				return !hasConflict; // Return true if no conflict
			}
		}
	}
	return true; // No conflict if not in same semester
}

/**
 * Evaluate minimum credit points requirement
 */

function EvaluateMinCP(req, completed_units, planner, target_year, target_sem_index) {
	if (!req._minCP) return true;
	let totalCP = 0;
	// Calculate CP from completed units
	const passed_units = completed_units.filter(unit => unit.status === "pass");
	totalCP += passed_units.reduce((sum, unit) => sum + (unit.unit.credit_points || 0), 0);
	// Calculate CP from previous semesters in the planner
	if (planner && target_year && target_sem_index !== null) {
		for (const year of planner.years) {
			for (let sem_idx = 0; sem_idx < year.semesters.length; sem_idx++) {
				const semester = year.semesters[sem_idx];
				// Skip completed semesters and current/future semesters
				if (semester.sem_completed) continue;
				if (year.year > target_year) continue; //Cannot go beyond the targetted year
				if (year.year === target_year && sem_idx >= target_sem_index) continue; //Cannot go beyond the target year and target sem
				// Add CP from units in this semester
				totalCP += semester.units.reduce((sum, unit) => {
					if (unit.unit?.credit_points) {
						return sum + unit.unit.credit_points;
					}
					return sum;
				}, 0);
			}
		}
	}
	return totalCP >= req._minCP;
}

/**
 * Fetch student data from the database
 * @param {string} student_id - The student ID
 * @returns {Object} - Object containing student info and unit history
 */
async function FetchStudentData(student_id) {
	const student_info_res = await StudentDB.FetchStudents({ StudentID: student_id, includeAllInfo: true });
	if (student_info_res.length === 0) {
		return { status: false, message: 'Student not found', student_info: null };
	}
	let unit_history = student_info_res[0].unitHistory.filter(
		(u) => ["pass", "fail"].includes(u.Status?.toLowerCase())
	);
	let amendments = student_info_res[0].studentStudyPlannerAmmendments
	return {
		student_info: student_info_res[0],
		unit_history,
		amendments,
	};
}

/**
 * Initialize the master study planner
 * @param {number} planner_id - The planner ID
 * @returns {StudyPlanner} - The initialized master study planner
 */
async function InitializeMasterPlanner(planner_id, master_mode = false) {
	const master_study_planner = new StudyPlanner();
	const result = await master_study_planner.Init(planner_id, master_mode);
	if (result == false) {
		return { status: false, message: 'Student Study Planner not found' };
	}
	if (master_study_planner.details.status != 'Complete') {
		return { status: false, message: 'Study Planner is not complete' };
	}
	return { status: true, message: 'Study Planner initialized', data: master_study_planner };
}

/**
 * Group completed units by year and term
 */
function GroupCompletedUnits(completed_units) {
	let processed_completed_units = [];
	completed_units.forEach(unit => {
		unit.unit.availability = 'published'
		let year_entry = processed_completed_units.find(entry => entry.year === unit.year);
		if (!year_entry) {
			year_entry = {
				year: unit.year,
				terms: []
			};
			processed_completed_units.push(year_entry);
		}
		let term_entry = year_entry.terms.find(entry => entry.term.ID === unit.term.ID);
		if (!term_entry) {
			term_entry = {
				term: unit.term,
				units: []
			};
			year_entry.terms.push(term_entry);
		}
		term_entry.units.push(unit);
	});
	processed_completed_units.sort((a, b) => a.year - b.year);
	processed_completed_units.forEach(year_entry => {
		year_entry.terms.sort((a, b) => {
			if (a.term.ID !== b.term.ID) {
				return a.term.ID - b.term.ID;
			}
			if (a.term.Year !== b.term.Year) {
				return a.term.Year - b.term.Year;
			}
			return a.term.Month - b.term.Month;
		});
	});
	return processed_completed_units;
}

/**
 * Find all semesters with a specific term type
 */
function FindSemestersByTerm(planner, term_type) {
	const target_semesters = [];
	for (const year of planner.years) {
		for (let sem_idx = 0; sem_idx < year.semesters.length; sem_idx++) {
			const semester = year.semesters[sem_idx];
			if (semester.sem_term === term_type && !semester.sem_completed) {
				target_semesters.push({
					year: year.year,
					sem_index: sem_idx,
					sem_id: semester.sem_id
				});
			}
		}
	}
	return target_semesters;
}

function AddElectiveToAvailableSemesters(years) {
	let available_year_sem_index = null;
	let fallback_incomplete = null;

	for (const [year_index, year] of years.entries()) {
		for (const [sem_index, sem] of year.semester.entries()) {
			if (!sem.complete) {
				// If it has space, pick it immediately
				if (sem.units.length < sem.unit_count) {
					available_year_sem_index = { year_index, sem_index };
					break;
				}
				// Otherwise, store it as a fallback if not yet found
				if (!fallback_incomplete) {
					fallback_incomplete = { year_index, sem_index };
				}
			}
		}
		if (available_year_sem_index) break;
	}

	// Use fallback if no semester with space found
	available_year_sem_index ??= fallback_incomplete;

	// Return false if still nothing
	if (!available_year_sem_index) {
		return false;
	}

	const year_index = available_year_sem_index.year_index;
	const sem_index = available_year_sem_index.sem_index;

	const elective_type_info = GetUnitTypeByName("elective");
	const empty_elective_obj = {
		unit_type: elective_type_info,
		unit: {
			unit_id: null,
			code: null,
			name: null,
			credit_points: 12.5,
			availability: "published"
		},
		requisites: [],
		has_conflict: false,
		is_offered: true,
		status: "planned"
	}

	years[year_index].semester[sem_index].units.push(empty_elective_obj);
	return true;
}

function DeleteAnyAvailableElectiveInPlanner(years) {
	let is_deleted = false;

	for (const [year_index, year] of years.entries()) {
		for (const [sem_index, sem] of year.semester.entries()) {
			if (is_deleted) break;

			if (!sem.complete) {
				for (const [unit_index, unit] of sem.units.entries()) {
					if ((unit.unit?.id == null) && (unit.unit_type?._name?.toLowerCase() === "elective")) {
						sem.units.splice(unit_index, 1);
						is_deleted = true;
						break;
					}
				}
			}
		}
		if (is_deleted) break;
	}
}