class UnitInSemesterStudyPlanner {
    constructor({ id = null, unit_id, unit_type_id, unit_code, semester_in_study_planner_year_id }) {
        this.id = id;
        this.unit_id = unit_id;
        this.unit_type_id = unit_type_id;
        this.unit_code = unit_code;
        this.semester_in_study_planner_year_id = semester_in_study_planner_year_id;
    }

    // Getters and Setters
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

    get unit_type_id() {
        return this._unit_type_id;
    }
    set unit_type_id(value) {
        this._unit_type_id = value;
    }

    get unit_code() {
        return this._unit_code;
    }
    set unit_code(value) {
        this._unit_code = value;
    }

    get semester_in_study_planner_year_id() {
        return this._semester_in_study_planner_year_id;
    }
    set semester_in_study_planner_year_id(value) {
        this._semester_in_study_planner_year_id = value;
    }
}

export default UnitInSemesterStudyPlanner;
