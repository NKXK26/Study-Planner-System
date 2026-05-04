class UnitTermOffered {
	constructor({ id, unit_id, unit_code, term_type }) {
		this._id = id;
		this._unit_id = unit_id;
		this._unit_code = unit_code;
		this._term_type = term_type;
	}

	// Getters
	get id() {
		return this._id;
	}

	get unit_id() {
		return this._unit_id;
	}

	get unit_code() {
		return this._unit_code;
	}

	get term_type() {
		return this._term_type;
	}

	// Setters
	set id(value) {
		if (typeof value !== "number") throw new Error("id must be a number");
		this._id = value;
	}

	set unit_id(value) {
		if (typeof value !== "number") throw new Error("unit_id must be a number");
		this._unit_id = value;
	}

	set unit_code(value) {
		if (typeof value !== "string") throw new Error("unit_code must be a string");
		this._unit_code = value.trim();
	}

	set term_type(value) {
		if (typeof value !== "string") throw new Error("term_type must be a string");
		this._term_type = value.trim();
	}
}

export default UnitTermOffered;
