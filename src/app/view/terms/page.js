'use client';
import TermListing from './listing';
import { useState, useEffect, useRef } from 'react';
import styles from '@styles/term.module.css';
import Form from './form';
import TermFileUploader from './TermFileUploader';
import TermDB from "@app/class/Term/termDB";
import { ConditionalRequireAuth } from '@components/helper';
import { useRole } from '@app/context/RoleContext';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import { useLightDarkMode } from '@app/context/LightDarkMode';
import InfoTooltip from '@components/InfoTooltip';

const TermPage = () => {
  const { can } = useRole();
  const { theme } = useLightDarkMode();
  const [showForm, setShowForm] = useState(false);
  const [showFileUploader, setShowFileUploader] = useState(false);
  const [formMode, setFormMode] = useState("VIEW");  // Modes: "READ", "ADD", "EDIT"
  const [selectedTermId, setSelectedTermId] = useState(null);
  const [selectedTerm, setSelectedTerm] = useState(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [termToDelete, setTermToDelete] = useState(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  // Actual search parameters that get sent to the backend
  const [params, setParams] = useState({
    name: "",
    month: "",
    year: "",
    status: "",
    return: ["ID", "Name", "Month", "Year", "SemType", "Status"],
    order_by: [
      { column: "Year", ascending: false },
      { column: "Month", ascending: false }
    ],
    page: 1,
    limit: 10,
  });

  // Temporary input values that don't trigger search
  const [inputValues, setInputValues] = useState({
    name: "",
    month: "",
    year: "",
    status: "all"
  });

  // Trigger to perform a search
  const [searchTrigger, setSearchTrigger] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState(null);

  const is_first_load = useRef(true);

  // Initialize values on component mount
  useEffect(() => {
    setInputValues({
      name: params.name,
      month: params.month,
      year: params.year,
      status: params.status
    });
  }, []);

  // Fetch data on first load only
  useEffect(() => {
    if (is_first_load.current) {
      is_first_load.current = false;
      // Initial data load
      setSearchTrigger(prev => !prev);
      // Delay to ensure loading screen shows
      setTimeout(() => {
        setIsLoading(false);
      }, 500);
    }
  }, []);

  // Open form handler
  const HandleOpenForm = (mode, termID = null, term = null) => {
    // Permission gating for simulated roles
    if (mode === 'ADD' && !can('term', 'create')) {
      window.Swal?.fire?.({ title: 'Permission denied', text: 'You need term:create', icon: 'warning' });
      return;
    }
    if (mode === 'EDIT' && !can('term', 'update')) {
      window.Swal?.fire?.({ title: 'Permission denied', text: 'You need term:update', icon: 'warning' });
      return;
    }
    setFormMode(mode === "VIEW" ? "VIEW" : mode);
    setSelectedTermId(termID);
    setSelectedTerm(term);
    setShowForm(true);
  };

  // File uploader handlers
  const handleOpenFileUploader = () => {
    setShowFileUploader(true);
  };

  const handleCloseFileUploader = () => {
    setShowFileUploader(false);
  };

  // Filter change handler for terms
  // Term name search handler
  const handleTermNameSearch = (e) => {
    const { value } = e.target;
    setInputValues((prev) => ({
      ...prev,
      name: value,
    }));
  };

  // Handle Enter key press in search field
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  // Filter Change handler for advanced filters
  const HandleFilterChange = (e) => {
    const { name, value } = e.target;
    const trimmedValue = value;

    setInputValues((prev) => ({
      ...prev,
      [name]: trimmedValue,
    }));
  };

  // Apply filters from the modal
  const applyFilters = () => {
    setShowFilterModal(false);
    // Apply the temporary input values to the actual params
    setParams((prev) => ({
      ...prev,
      ...inputValues
    }));
    // Trigger search with the current filters
    setSearchTrigger(prev => !prev);
  };

  const resetFilters = () => {
    setParams({
      name: "",
      month: "",
      year: "",
      status: "all",
      return: ["ID", "Name", "Month", "Year", "SemType", "Status"],
      order_by: [
        { column: "Year", ascending: false },
        { column: "Month", ascending: false }
      ],
    });
    setInputValues({
      name: "",
      month: "",
      year: "",
      status: "all"
    });
    setSearchTrigger(prev => !prev);
  };

  // Handle search button click
  const handleSearch = () => {
    // Apply the temporary input values to the actual params
    setParams((prev) => ({
      ...prev,
      ...inputValues
    }));
    // Trigger a search by toggling the search trigger
    setSearchTrigger(prev => !prev);
  };

  const handleDeleteClick = async (termId) => {
    const result = await window.Swal.fire({
      title: 'Delete Term',
      text: 'Are you sure you want to delete this term? This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'No, cancel'
    });

    if (result.isConfirmed) {
      setTermToDelete(termId);
      handleConfirmDelete();
    }
  };

  const handleConfirmDelete = async () => {
    if (!can('term', 'delete')) {
      await window.Swal?.fire?.({ title: 'Permission denied', text: 'You need term:delete', icon: 'warning' });
      return;
    }
    try {
      if (!termToDelete) {
        throw new Error("No term selected for deletion");
      }

      const response = await TermDB.DeleteTerm(termToDelete);

      if (response.success) {
        await window.Swal.fire({
          title: 'Deleted!',
          text: 'Term has been deleted successfully.',
          icon: 'success'
        });
        setTermToDelete(null);
        setSearchTrigger(prev => !prev); // Refresh list
      } else {
        await window.Swal.fire({
          title: 'Error',
          text: response.message || 'Failed to delete term',
          icon: 'error'
        });
      }
    } catch (err) {
      console.error("Delete error:", err);
      await window.Swal.fire({
        title: 'Error',
        text: err.message || 'An error occurred while deleting the term',
        icon: 'error'
      });
    }
  };

  // Refresh function for after import
  const refreshList = () => {
    setParams(prev => ({ ...prev }));
  };

  // Pagination handlers
  const handlePageChange = (newPage) => {
    if (newPage < 1) return;
    setParams(prev => ({ ...prev, page: newPage }));
    setSearchTrigger(prev => !prev);
  };

  const handleLimitChange = (newLimit) => {
    setParams(prev => ({ ...prev, limit: newLimit, page: 1 }));
    setSearchTrigger(prev => !prev);
  };

  return (
    <ConditionalRequireAuth>
      <PageLoadingWrapper
        requiredPermission={{ resource: 'term', action: 'read' }}
        resourceName="term management"
        isLoading={isLoading}
        loadingText="Loading terms..."
        error={pageError}
        errorMessage="Failed to load terms"
        showPermissionLoading={false}
      >
        <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}>
          <div className="w-full px-4 sm:px-6 lg:px-8 py-6 bg-white dark:bg-transparent">
            {/* Term Form Modal */}
            {showForm && (
              <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
                <Form
                  onClose={() => setShowForm(false)}
                  mode={formMode}
                  termId={selectedTermId}
                  // RefreshList={() => setSearchTrigger(prev => !prev)}
                  RefreshList={refreshList}
                  HandleOpenForm={HandleOpenForm}
                  onDeleteClick={handleDeleteClick}
                  term={selectedTerm}
                />
              </div>
            )}
            {showFileUploader && (
              <TermFileUploader
                onClose={handleCloseFileUploader}
                onUploadSuccess={() => {
                  setSearchTrigger(prev => !prev); // REFRESH THE LIST
                }}
              />
            )}

            {/* Advanced Filter Modal */}
            {showFilterModal && (
              <div className="fixed inset-0 flex items-center justify-center z-50"
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                onClick={() => setShowFilterModal(false)} // Add click handler to overlay
              >
                <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} p-6 rounded-lg shadow-xl w-[500px]`}
                  onClick={(e) => e.stopPropagation()} // Prevent event bubbling
                >
                  <div className="flex justify-between items-center mb-4">
                    <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>Advanced Filters</h2>
                    <button className={`${theme === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}>
                      <svg width="24" height="24" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="filter_name" className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Term Name</label>
                      <input
                        type="text"
                        name="name"
                        id="filter_name"
                        className={`w-full p-2 rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'} border`}
                        value={inputValues.name}
                        onChange={HandleFilterChange}
                      />
                    </div>
                    <div>
                      <label htmlFor="filter_year" className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Year</label>
                      <input
                        type="number"
                        name="year"
                        id="filter_year"
                        className={`w-full p-2 rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'} border`}
                        value={inputValues.year}
                        onChange={HandleFilterChange}
                        min="2000"
                      />
                    </div>
                    <div>
                      <label htmlFor="filter_month" className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Month</label>
                      <select
                        name="month"
                        id="filter_month"
                        className={`w-full p-2 rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'} border`}
                        value={inputValues.month}
                        onChange={HandleFilterChange}
                      >
                        <option value="">All Months</option>
                        <option value="1">January</option>
                        <option value="2">February</option>
                        <option value="3">March</option>
                        <option value="4">April</option>
                        <option value="5">May</option>
                        <option value="6">June</option>
                        <option value="7">July</option>
                        <option value="8">August</option>
                        <option value="9">September</option>
                        <option value="10">October</option>
                        <option value="11">November</option>
                        <option value="12">December</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        name="status"
                        id="status"
                        className="border w-full p-2 rounded"
                        value={inputValues.status}
                        onChange={HandleFilterChange}
                      >
                        <option value="all">All</option>
                        <option value="unavailable">Unavailable</option>
                        <option value="published">Published</option>
                        <option value="unpublished">Unpublished</option>
                      </select>
                    </div>

                    <div className="flex justify-end space-x-2 pt-4">
                      <button
                        onClick={() => setShowFilterModal(false)}
                        className={`px-4 py-2 rounded ${theme === 'dark' ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-100'} border`}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={applyFilters}
                        className="px-4 py-2 bg-[#DC2D27] text-white rounded hover:bg-red-700"
                      >
                        Apply Filters
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div
              className={`term-wrapper p-3 w-full ${styles.termWrapper}`}
            >
              <h1 className="title-text">
                Term Management
                <InfoTooltip
                  content={"In this page, it is where all the terms that are currently in the database will be shown. All terms have their Name, Year, Month, Semester Type, and Status."}
                  position='right'
                  className='info-bttn'
                ></InfoTooltip>
              </h1>

              {/* SEARCH INTERFACE */}
              <div className='flex space-x-4 mb-6 lg:flex-row flex-col md:text-md text-sm'>
                <div className='flex-1'>
                  <input
                    type="text"
                    name="name"
                    placeholder="Search by Term Name"
                    className="input-field-alt w-full p-3 rounded-md border"
                    value={inputValues.name}
                    onChange={handleTermNameSearch}
                    onKeyDown={handleKeyDown}
                  />
                </div>

                <div className='flex sm:flex-row flex-col gap-2 lg:mt-0 mt-4'>
                  <div className='flex flex-row sm:w-auto w-full gap-2'>
                    <button
                      onClick={() => setShowFilterModal(true)}
                      className="btn-secondary px-4 py-3 rounded-md flex justify-center items-center sm:flex-none flex-1"
                    >
                      Advanced Filter
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                    </button>

                    <button
                      onClick={resetFilters}
                      disabled={!inputValues.name || inputValues.name.trim() === ''}
                      className="btn-secondary px-4 py-3 rounded-md flex justify-center items-center sm:flex-none flex-1 disabled:opacity-50"
                    >
                      Reset Filters
                    </button>

                    <button
                      onClick={handleSearch}
                      disabled={!inputValues.name || inputValues.name.trim() === ''}
                      className={`px-4 py-3 rounded-md flex justify-center items-center sm:flex-none flex-1 ${!inputValues.name || inputValues.name.trim() === ''
                        ? "btn-primary-disabled"
                        : "btn-primary"
                        }`}
                    >
                      Search
                    </button>
                  </div>

                  {can('term', 'create') && (
                    <div className="flex flex-row gap-2 sm:w-auto w-full">
                      {/* Add Term Button */}
                      <button
                        onClick={() => HandleOpenForm("ADD")}
                        disabled={!can('term', 'create')}
                        className={`px-4 py-3 rounded-md flex justify-center items-center sm:flex-none flex-1 ${can('term', 'create') ? 'btn-primary' : 'btn-primary-disabled'
                          }`}
                      >
                        Add Term
                        <span className="ml-1 text-xl">+</span>
                      </button>

                      {/* Import Terms Button */}
                      <button
                        onClick={handleOpenFileUploader}
                        disabled={!can('term', 'create')}
                        className={`px-4 py-3 rounded-md flex justify-center items-center sm:flex-none flex-1 border-2 ${can('term', 'create')
                          ? theme === 'dark'
                            ? 'bg-[#DC2D27] text-white cursor-pointer hover:bg-red-700 border-[#DC2D27]'
                            : 'bg-white text-[#DC2D27] cursor-pointer hover:bg-gray-50 border-red-600'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-100'
                          }`}
                      >
                        Import Terms
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="1.5"
                          stroke="currentColor"
                          className="size-6 ml-2"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* TABLE FOR TERMS */}
              <div className={`${styles.termListingContainer} mt-5 shadow-md sm:rounded-lg`}>
                <table className={`table-base`}>
                  <thead>
                    <tr className={`table-header-row`}>
                      <th scope="col" className="term-table-cell-no">No</th>
                      <th scope="col" className="term-table-cell-name">Term Name</th>
                      <th scope="col" className="term-table-cell-year">Year</th>
                      <th scope="col" className="term-table-cell-month">Month</th>
                      <th scope="col" className="term-table-cell-semtype">Semester Type</th>
                      <th scope="col" className="term-table-cell-status">Status</th>
                      <th scope="col" className="term-table-cell-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody className={`table-body-divided`}>
                    <TermListing
                      params={params}
                      searchTrigger={searchTrigger}
                      HandleOpenForm={HandleOpenForm}
                      onDeleteClick={handleDeleteClick}
                      refreshList={refreshList}
                      setPagination={setPagination}
                    />
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {pagination.total > 0 && (
                <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                  {/* Items per page selector */}
                  <div className="flex items-center gap-2">
                    <label className={`pagination-text}`}>Items per page:</label>
                    <select
                      value={params.limit || 10}
                      onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                      className={`rounded px-2 py-1 text-sm ${theme === 'dark' ? 'border-gray-600 bg-gray-800 text-gray-100' : 'border-gray-300 bg-white text-gray-900'} border`}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                    </select>
                  </div>

                  {/* Page info */}
                  <div className={`pagination-information`}>
                    Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
                  </div>

                  {/* Page navigation */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page <= 1}
                      className={`pagination-btn`}
                    >
                      Previous
                    </button>

                    {/* Page numbers */}
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                        let pageNum;
                        if (pagination.totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (pagination.page <= 3) {
                          pageNum = i + 1;
                        } else if (pagination.page >= pagination.totalPages - 2) {
                          pageNum = pagination.totalPages - 4 + i;
                        } else {
                          pageNum = pagination.page - 2 + i;
                        }

                        return (
                          <button
                            key={pageNum}
                            onClick={() => handlePageChange(pageNum)}
                            className={pagination.page === pageNum ? 'pagination-btn-active' : 'pagination-btn'}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page >= pagination.totalPages}
                      className="pagination-btn"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </PageLoadingWrapper>
    </ConditionalRequireAuth >
  );
}

export default TermPage;