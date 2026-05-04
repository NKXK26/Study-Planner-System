class Course {
	constructor({ id = null, code, name, credits_required, status, majors = []}) {
		this.id = id;
		this.code = code;
		this.name = name;
		this.credits_required = credits_required;
		this.status = status;
		this.majors = majors
	}

	get majors(){
		return this._majors;
	}

	set majors(value){
		this._majors = value;
	}

	// Getters and Setters
	get id() {
		return this._id;
	}
	set id(value) {
		this._id = value;
	}

	get code() {
		return this._code;
	}
	set code(value) {
		this._code = value;
	}

	get name() {
		return this._name;
	}
	set name(value) {
		this._name = value;
	}

	get credits_required() {
		return this._credits_required;
	}
	set credits_required(value) {
		this._credits_required = value;
	}

	get status() {
		return this._status;
	}
	set status(value) {
		this._status = value;
	}
}

export default Course;