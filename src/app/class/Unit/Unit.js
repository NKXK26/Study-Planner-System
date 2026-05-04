class Unit {
	constructor({id, unit_code, name, availability, requisites, credit_points, offered_terms }) {
		this.id = id;
		this.unit_code = unit_code;
		this.name = name;
		this.availability = availability;
		this.requisites = requisites || null;
		this.credit_points = credit_points;
		this.offered_terms = offered_terms || [];
	}

	get id() {
		return this._id;
	}

	set id(value) {
		this._id = value;
	}

	get offered_terms() {
		return this._offered_terms;
	}
	set offered_terms(value) {
		this._offered_terms = value;
	}

	// Getter and Setter for unit_code
	get unit_code() {
		return this._unit_code;
	}
	set unit_code(value) {
		this._unit_code = value;
	}

	// Getter and Setter for name
	get name() {
		return this._name;
	}
	set name(value) {
		this._name = value;
	}

	// Getter and Setter for availability
	get availability() {
		return this._availability;
	}
	set availability(value) {
		this._availability = value;
	}

	// Getter and Setter for requisites
	get requisites() {
		return this._requisites;
	}
	set requisites(value) {
		this._requisites = value;
	}

	// Getter and Setter for credit_points
	get credit_points() {
		return this._credit_points;
	}
	set credit_points(value) {
		this._credit_points = value;
	}
}
export default Unit;