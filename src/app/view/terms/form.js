
import Button from '../../../components/button.js';
import { useEffect, useState, useRef } from 'react';
import TermDB from '@app/class/Term/termDB';
import ConfirmPopup from '@components/confirm';
import { useRole } from '@app/context/RoleContext';
import { useLightDarkMode } from '@app/context/LightDarkMode';
import InfoTooltip from '@components/InfoTooltip.js';

const Form = ({ onClose, mode, termId, RefreshList, HandleOpenForm, term }) => {
  const [termData, setTermData] = useState({
    id: "",
    name: "",
    year: "",
    month: "",
    semtype: "",
    status: "",
  });
  const { can } = useRole();
  const { theme } = useLightDarkMode();
  const is_fetching = useRef(false);
  const formRef = useRef(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [allTerms, setAllTerms] = useState([]);
  const [saveLoading, setSaveLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Add click outside handler
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is on the confirmation dialog
      const confirmDialog = document.querySelector('.swal2-container');
      if (confirmDialog && confirmDialog.contains(event.target)) {
        return;
      }

      if (formRef.current && !formRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Array of month names with their corresponding numeric values
  const months = [
    { name: "January", value: "1" },
    { name: "February", value: "2" },
    { name: "March", value: "3" },
    { name: "April", value: "4" },
    { name: "May", value: "5" },
    { name: "June", value: "6" },
    { name: "July", value: "7" },
    { name: "August", value: "8" },
    { name: "September", value: "9" },
    { name: "October", value: "10" },
    { name: "November", value: "11" },
    { name: "December", value: "12" }
  ];

  useEffect(() => {
    const SetData = async () => {
      if ((mode === 'VIEW' || mode === 'EDIT') && term) {
        try {
          if (term) {
            setTermData({
              name: term.name || "",
              year: term.year || "",
              month: term.month || "",
              semtype: term.semtype || "",
              status: term.status || "",
            });
          } else {
            await window.Swal.fire({
              title: 'Validation Error',
              text: `Term ID: ${termId} is invalid`,
              icon: 'error'
            });
            onClose();
          }
        } catch (error) {
          await window.Swal.fire({
            title: 'Error',
            text: 'Failed to fetch term data',
            icon: 'error'
          });
          onClose();
        } finally {
        }
      }
    };
    SetData()
  }, [term, mode, onClose]);

  // useEffect(() => {
  //   const fetchAllTerms = async () => {
  //     try {
  //       const result = await TermDB.FetchTerms({ return: ['id', 'name', 'year', 'month', 'semtype'] });
  //       const arr = Array.isArray(result) ? result : (Array.isArray(result.data) ? result.data : []);
  //       setAllTerms(arr);
  //     } catch (err) {
  //       setAllTerms([]);
  //     }
  //   };
  //   fetchAllTerms();
  // }, []);

  const SubmitForm = async (e) => {
    setSaveLoading(true);
    e.preventDefault();
    const method_type = mode === 'ADD' ? 'POST' : 'PUT';
    const formData = new FormData(e.target);
    const term = Object.fromEntries(formData.entries());

    const errors = [];
    if (!term.name || !term.year || !term.month || !term.status || !term.semtype) {
      errors.push("All fields including Semester Type are required!");
    }

    if (isNaN(term.year) || term.year <= 2000) {
      errors.push("Year must be a valid number starting from 2000!");
    }

    // Prevent duplicate term name, year, month, and semester type  (case-insensitive, ignore self in edit mode)
    const duplicate = allTerms.find(t => {
      const tName = t.name || t._name;
      const tYear = t.year || t._year;
      const tMonth = t.month || t._month;
      const tSemtype = t.semtype || t._semtype;
      const tId = t.id || t._id;

      // First check for duplicate Year + Month + SemType
      if (
        tYear == term.year &&
        tMonth == term.month &&
        tSemtype.trim().toLowerCase() === term.semtype.trim().toLowerCase() &&
        (mode === 'ADD' || (mode === 'EDIT' && tId !== termId))
      ) {
        return true;
      }

      if (
        tName &&
        tName.trim().toLowerCase() === term.name.trim().toLowerCase() &&
        (mode === 'ADD' || (mode === 'EDIT' && tId !== termId))
      ) {
        return true;
      }

      return false;
    });
    if (duplicate) {
      await window.Swal.fire({
        title: 'Error',
        text: 'A term with these details already exists.',
        icon: 'error'
      });
      setSaveLoading(false);
      return;
    }
    // const duplicate = allTerms.find(t => {
    //   const tName = t.name || t._name;
    //   const tYear = t.year || t._year;
    //   const tMonth = t.month || t._month;
    //   const tSemtype = t.semtype || t._semtype;
    //   const tId = t.id || t._id;

    //   // First check for duplicate Year + Month + SemType
    //   if (
    //     tYear == term.year &&
    //     tMonth == term.month &&
    //     tSemtype.trim().toLowerCase() === term.semtype.trim().toLowerCase() &&
    //     (mode === 'ADD' || (mode === 'EDIT' && tId !== termId))
    //   ) {
    //     return true;
    //   }

    //   if (
    //     tName &&
    //     tName.trim().toLowerCase() === term.name.trim().toLowerCase() &&
    //     (mode === 'ADD' || (mode === 'EDIT' && tId !== termId))
    //   ) {
    //     return true;
    //   }

    //   return false;
    // });
    // if (duplicate) {
    //   await window.Swal.fire({
    //     title: 'Error',
    //     text: 'A term with these details already exists.',
    //     icon: 'error'
    //   });
    //   setSaveLoading(false);
    //   return;
    // }

    if (errors.length > 0) {
      await window.Swal.fire({
        title: 'Validation Error',
        text: errors.join('\n'),
        icon: 'error'
      });
      setSaveLoading(false);
      return;
    }

    try {
      let response;
      if (method_type === 'PUT') {
        term.id = termId;
        response = await TermDB.UpdateTerm(term);
      } else {
        response = await TermDB.AddTerm(term);
      }
      setSaveLoading(false);

      if (response.success) {
        await window.Swal.fire({
          title: 'Success',
          text: response.message,
          icon: 'success'
        });
        RefreshList();
        onClose();
      } else {
        await window.Swal.fire({
          title: 'Error',
          text: response.message,
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('Fetch error:', error);
    }
  };

  const form_heading_text = mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();
  const is_read_only = mode === "VIEW";

  const HandleConfirmDelete = async () => {
    try {
      setDeleteLoading(true);
      if (!termId) {
        throw new Error("No term selected for deletion");
      }

      const response = await TermDB.DeleteTerm(termId);

      if (response.success) {
        await window.Swal.fire({
          title: 'Deleted!',
          text: response.message || 'Term deleted successfully.',
          icon: 'success',
          confirmButtonText: 'OK',
          confirmButtonColor: '#3085d6'
        });
        setDeleteLoading(false);
        setIsDeleteOpen(false);
        RefreshList();
        onClose();
      } else {
        await window.Swal.fire({
          title: 'Cannot Delete',
          text: 'Cannot delete term because it is referenced in other records',
          icon: 'error',
          confirmButtonText: 'OK',
          confirmButtonColor: '#d33'
        });
      }
      setDeleteLoading(false);
    } catch (err) {
      console.error("Delete error:", err);
      await window.Swal.fire({
        title: 'Error',
        text: `An error occurred while deleting the term: ${err.message || ''}`,
        icon: 'error',
        confirmButtonText: 'OK',
        confirmButtonColor: '#d33'
      });
    }
  };

  return (
    <div className="VED-wrapper">
      <div ref={formRef} className="VED-container w-full sm:w-1/2">
        {/* Header */}
        <div className="VED-header">
          <div className="flex items-center gap-2">
            <h1 className='VED-title'>{form_heading_text} Term</h1>
            <InfoTooltip
              content={
                mode === 'VIEW'
                  ? "Currently viewing the Terms"
                  : mode === 'EDIT'
                    ? "Currently editting the Terms, able to edit Year, Name, Type of Semester"
                    : mode === 'ADD'
                      ? "Adding a new Terms, insure the information input are valid and correct."
                      : "Term management form" // Default fallback text
              }
              position="bottom"
              className="ml-2"
            />
          </div>
          <button
            onClick={onClose}
            className="VED-close-btn"
          >
            <svg width="24" height="24" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={SubmitForm} className="p-6 overflow-y-auto flex flex-col h-full">

          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
            {/* Left Column */}
            <div className="flex-1">
              {/* Term Name */}
              <div className="mb-4">
                <label htmlFor="name" className="label-text-alt">Name:</label>
                <input
                  type="text"
                  name="name"
                  id="name"
                  className="form-input"
                  placeholder='2022_SEP_S1'
                  defaultValue={termData.name}
                  required
                  disabled={is_read_only}
                />
              </div>

              {/* Year */}
              <div className="mb-4">
                <label htmlFor="year" className="label-text-alt">Year:</label>
                <input
                  type="number"
                  name="year"
                  id="year"
                  className="form-input"
                  defaultValue={termData.year}
                  required
                  disabled={is_read_only}
                  onWheel={(e) => e.target.blur()}
                />
              </div>
            </div>

            {/* Right Column */}
            <div className="flex-1 lg:border-l lg:pl-6 border-divider">
              {/* Month */}
              <div className="mb-4">
                <label htmlFor="month" className="label-text-alt">Month:</label>
                <select
                  name="month"
                  id="month"
                  className="form-input"
                  value={termData.month}
                  onChange={(e) => setTermData({ ...termData, month: e.target.value })}
                  required
                  disabled={is_read_only}
                >
                  <option value="">Select Month</option>
                  {months.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div className="mb-4">
                <label htmlFor="status" className="label-text-alt">Status:</label>
                <select
                  name="status"
                  id="status"
                  className="form-input"
                  value={termData.status}
                  onChange={(e) => setTermData({ ...termData, status: e.target.value })}
                  required
                  disabled={is_read_only}
                >
                  <option value="">Select Status</option>
                  <option value="unavailable">Unavailable</option>
                  <option value="published">Published</option>
                  <option value="unpublished">Unpublished</option>
                </select>
              </div>

              {/* Semester Type */}
              <div>
                <label className="label-text-alt mb-2">Semester Type:</label>
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-center text-primary">
                    <input
                      type="radio"
                      name="semtype"
                      value="Long Semester"
                      checked={termData.semtype === "Long Semester"}
                      onChange={(e) =>
                        setTermData((prev) => ({ ...prev, semtype: e.target.value }))
                      }
                      disabled={is_read_only && termData.semtype !== "Long Semester"}
                      required
                      className="form-radio h-4 w-4 text-blue-600"
                    />
                    <span className="ml-2">Long Semester</span>
                  </label>
                  <label className="inline-flex items-center text-primary">
                    <input
                      type="radio"
                      name="semtype"
                      value="Short Semester"
                      checked={termData.semtype === "Short Semester"}
                      onChange={(e) =>
                        setTermData((prev) => ({ ...prev, semtype: e.target.value }))
                      }
                      disabled={is_read_only && termData.semtype !== "Short Semester"}
                      required
                      className="form-radio h-4 w-4 text-blue-600"
                    />
                    <span className="ml-2">Short Semester</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex justify-end space-x-4">
            {mode === "VIEW" ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className={`mx-3 px-4 py-2 rounded-xl cursor-pointer ${theme === 'dark'
                    ? 'bg-gray-700 text-gray-100 hover:bg-gray-600'
                    : 'bg-white text-gray-900 border-2 border-gray-300 hover:bg-gray-50'
                    }`}
                >
                  Close
                </button>
                {can('term', 'update') ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      HandleOpenForm('EDIT', termId, term);
                    }}
                    className="bg-[#dc2d27] text-white mx-3 px-4 py-2 rounded-xl cursor-pointer hover:bg-red-700"
                  >
                    Edit Term
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <Button
                  type="button"
                  onClick={onClose}
                  variant="cancel"
                  className="bg-[#dc2d27] text-white mx-3 px-4 py-2 rounded-xl cursor-pointer hover:bg-red-700"
                >
                  Cancel
                </Button>
                {mode === "EDIT" && (
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await window.Swal.fire({
                        title: 'Delete Term',
                        text: 'Are you sure you want to delete this term? This action cannot be undone.',
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#d33',
                        cancelButtonColor: '#d33',
                        confirmButtonText: 'Yes, delete it!',
                        cancelButtonText: 'No, cancel'
                      });

                      if (result.isConfirmed) {
                        HandleConfirmDelete();
                      }
                    }}
                    className="bg-[#dc2d27] text-white mx-3 px-4 py-2 rounded-xl cursor-pointer hover:bg-red-700"
                  >
                    {
                      deleteLoading ? (
                        <span className="flex items-center space-x-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                              fill="none"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          <span>Deleting...</span>
                        </span>
                      ) : (
                        <>Delete</>
                      )
                    }
                  </button>
                )}
                {(can('term', 'create') || can('term', 'update')) ? (
                  <Button
                    type="submit"
                    variant="submit"
                    className="px-4 py-2  text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-70"
                    disabled={saveLoading}
                  >
                    {saveLoading ? (
                      <span className="flex items-center space-x-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        <span>Saving...</span>
                      </span>
                    ) : (
                      <span className='text-white'>{mode === "ADD" ? "Add Term" : "Save Changes"}</span>
                    )}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default Form;