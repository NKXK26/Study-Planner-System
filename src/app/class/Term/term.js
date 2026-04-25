class Term {
  constructor(id, name, year, month, semtype, status) {
    this._id = id;  // Store id in a private variable
    this._name = name;
    this._year = year;
    this._month = month;
    this._semtype = semtype;
    this._status = status;
  }

  // Getter and Setter for ID
  get id() {
    return this._id;  // Return the private variable _id
  }

  set id(value) {
    this._id = value;  // Set the value to the private variable _id
  }

  // Getter and Setter for Name
  get name() {
    return this._name;
  }

  set name(value) {
    this._name = value;
  }

  // Getter and Setter for Year
  get year() {
    return this._year;
  }

  set year(value) {
    this._year = value;
  }

  // Getter and Setter for Month
  get month() {
    return this._month;
  }

  set month(value) {
    this._month = value;
  }

  // Getter and Setter for Semester Type
  get semtype() {
    return this._semtype;
  }

  set semtype(value) {
    this._semtype = value;
  }

  // Getter and Setter for Status
  get status() {
    return this._status;
  }

  set status(value) {
    this._status = value;
  }
}

export default Term;
