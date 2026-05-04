class SemesterInStudyPlannerYear {
	constructor({ id = null, master_study_planner_id, year, sem_type }) {
		this.id = id;
		this.master_study_planner_id = master_study_planner_id;
		this.year = year;
		this.sem_type = sem_type;
	}

	// Getters and Setters
	get id() {
		return this._id;
	}
	set id(value) {
		this._id = value;
	}

	get master_study_planner_id() {
		return this._master_study_planner_id;
	}
	set master_study_planner_id(value) {
		this._master_study_planner_id = value;
	}

	get year() {
		return this._year;
	}
	set year(value) {
		this._year = value;
	}

	get sem_type() {
		return this._sem_type;
	}
	set sem_type(value) {
		this._sem_type = value;
	}
}

export default SemesterInStudyPlannerYear;
