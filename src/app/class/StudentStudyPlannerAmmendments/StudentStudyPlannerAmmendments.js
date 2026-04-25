class StudentStudyPlannerAmmendments {
	constructor({
		id = null,
		student_id = null,
		unit_id = null,
		unit_code = null,
		new_unit_code = null,
		new_unit_id = null,
		action = null,
		time_of_action = null,
		old_unit_type_id = null,
		new_unit_type_id = null,
		year = null,
		sem_index = null,
		sem_type = null,
		sem_id = null,
	}) {
		this._id = id;
		this._student_id = student_id;
		this._unit_id = unit_id;
		this._unit_code = unit_code;
		this._new_unit_code = new_unit_code;
		this._new_unit_id = new_unit_id;
		this._action = action;
		this._time_of_action = time_of_action;
		this._old_unit_type_id = old_unit_type_id;
		this._new_unit_type_id = new_unit_type_id;
		this._year = year;
		this._sem_index = sem_index;
		this._sem_type = sem_type;
		this._sem_id = sem_id;
	}

	get id() {
		return this._id;
	}
	set id(value) {
		this._id = value;
	}

	get unit_id() {
		return this._unit_id;
	}
	set unit_id(value) {
		this._unit_id = value;
	}

	get new_unit_id() {
		return this._new_unit_id;
	}
	set new_unit_id(value) {
		this._new_unit_id = value;
	}

	get student_id() {
		return this._student_id;
	}
	set student_id(value) {
		this._student_id = value;
	}

	get unit_code() {
		return this._unit_code;
	}
	set unit_code(value) {
		this._unit_code = value;
	}

	get sem_type() {
		return this._sem_type;
	}
	set sem_type(value) {
		this._sem_type = value;
	}

	get new_unit_code() {
		return this._new_unit_code;
	}
	set new_unit_code(value) {
		this._new_unit_code = value;
	}

	get action() {
		return this._action;
	}
	set action(value) {
		this._action = value;
	}

	get time_of_action() {
		return this._time_of_action;
	}
	set time_of_action(value) {
		this._time_of_action = value;
	}

	get old_unit_type_id() {
		return this._old_unit_type_id;
	}
	set old_unit_type_id(value) {
		this._old_unit_type_id = value;
	}

	get new_unit_type_id() {
		return this._new_unit_type_id;
	}
	set new_unit_type_id(value) {
		this._new_unit_type_id = value;
	}

	get year() {
		return this._year;
	}
	set year(value) {
		this._year = value;
	}

	get sem_index() {
		return this._sem_index;
	}
	set sem_index(value) {
		this._sem_index = value;
	}

	get sem_id() {
		return this._sem_id;
	}
	set sem_id(value) {
		this._sem_id = value;
	}
}

export default StudentStudyPlannerAmmendments;
