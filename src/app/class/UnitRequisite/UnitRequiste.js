class UnitRequisite {
	constructor({ id, unit_id, requisite_unit_id, unit_code, requisite_unit_code, unit_relationship, operator, minCP }) {
		this._id = id;
		this._unit_id = unit_id;
		this._requisite_unit_id = requisite_unit_id;
		this._unit_code = unit_code;
		this._requisite_unit_code = requisite_unit_code;
		this._unit_relationship = unit_relationship;
		this._operator = operator;
		this._minCP = minCP;
	}

	// Getters for each property
	get id() {
		return this._id;
	}

	get unit_id() {
		return this._unit_id;
	}

	get requisite_unit_id() {
		return this._requisite_unit_id;
	}

	get unit_code() {
		return this._unit_code;
	}

	get requisite_unit_code() {
		return this._requisite_unit_code;
	}

	get unit_relationship() {
		return this._unit_relationship;
	}

	get operator() {
		return this._operator;
	}

	get minCP() {
		return this._minCP;
	}
}

export default UnitRequisite;
