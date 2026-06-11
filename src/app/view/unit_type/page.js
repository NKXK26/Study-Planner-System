'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Swal from 'sweetalert2';
import { ConditionalRequireAuth } from '@components/helper';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import { useLightDarkMode } from '@app/context/LightDarkMode';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

// Helper: check if a unit type is system‑restricted
const isRestrictedUnitType = (name) => {
  const restricted = ['core', 'major', 'elective', 'mpu'];
  return restricted.includes(name?.toLowerCase());
};

// ─────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────
export default function UnitTypeManagement() {
  const { can } = useRole();
  const { theme } = useLightDarkMode();

  // State for list & pagination
  const [unitTypes, setUnitTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState(null);
  const [params, setParams] = useState({
    name: "",
    page: 1,
    limit: 10,
  });
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  });
  const [searchTrigger, setSearchTrigger] = useState(false);
  const [inputName, setInputName] = useState("");

  // State for form modal
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState("VIEW"); // ADD, EDIT, VIEW
  const [selectedUnitType, setSelectedUnitType] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  // State for color mapping modal
  const [showColorModal, setShowColorModal] = useState(false);
  const [colorModalLoading, setColorModalLoading] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [extractedColors, setExtractedColors] = useState([]);
  const [unitTypeOptions, setUnitTypeOptions] = useState([]);
  const [colorModalError, setColorModalError] = useState(null);

  // Form internal state
  const [formData, setFormData] = useState({ name: "", colour: "#000000" });

  // Refs
  const formRef = useRef(null);
  const isFirstLoad = useRef(true);

  // ─────────────────────────────────────────────────────────────────────
  // Fetch unit types
  // ─────────────────────────────────────────────────────────────────────
  const fetchUnitTypes = useCallback(async () => {
    setIsLoading(true);
    setPageError(null);
    try {
      const queryParams = new URLSearchParams({
        page: params.page,
        limit: params.limit,
        ...(params.name && { name: params.name }),
      });
      const res = await SecureFrontendAuthHelper.authenticatedFetch(
        `/api/unit_type?${queryParams.toString()}`
      );
      const json = await res.json();
      if (json.success) {
        const data = json.data || [];
        setUnitTypes(data);
        setPagination({
          total: json.total || data.length,
          page: params.page,
          limit: params.limit,
          totalPages: Math.ceil((json.total || data.length) / params.limit),
        });
      } else {
        throw new Error(json.message || "Failed to fetch");
      }
    } catch (err) {
      console.error(err);
      setPageError(err.message);
      setUnitTypes([]);
    } finally {
      setIsLoading(false);
    }
  }, [params]);

  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      fetchUnitTypes();
    }
  }, [fetchUnitTypes]);

  useEffect(() => {
    if (!isFirstLoad.current) {
      fetchUnitTypes();
    }
  }, [searchTrigger, fetchUnitTypes]);

  const refreshList = () => setSearchTrigger(prev => !prev);

  // ─────────────────────────────────────────────────────────────────────
  // Form handlers (Create / Edit / View)
  // ─────────────────────────────────────────────────────────────────────
  const openForm = (mode, unit = null) => {
    if (mode === "ADD" && !can("unit_type", "create")) {
      Swal.fire("Permission denied", "You need unit_type:create", "warning");
      return;
    }
    if (mode === "EDIT" && !can("unit_type", "update")) {
      Swal.fire("Permission denied", "You need unit_type:update", "warning");
      return;
    }
    setFormMode(mode);
    setSelectedUnitType(unit);
    if (unit) {
      setFormData({ name: unit.name, colour: unit.colour || "#000000" });
    } else {
      setFormData({ name: "", colour: "#000000" });
    }
    setShowForm(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      Swal.fire("Validation Error", "Name is required", "error");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        colour: formData.colour,
      };
      let url = "/api/unit_type";
      let method = "POST";
      if (formMode === "EDIT" && selectedUnitType) {
        url = `/api/unit_type?id=${selectedUnitType.id}`;
        method = "PUT";
      }
      const res = await SecureFrontendAuthHelper.authenticatedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        Swal.fire("Success", `Unit type ${formMode === "ADD" ? "created" : "updated"}`, "success");
        setShowForm(false);
        refreshList();
      } else {
        throw new Error(json.message);
      }
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!can("unit_type", "delete")) {
      Swal.fire("Permission denied", "You need unit_type:delete", "warning");
      return;
    }
    if (isRestrictedUnitType(name)) {
      Swal.fire("Cannot Delete", `${name} is a system unit type.`, "warning");
      return;
    }
    const confirm = await Swal.fire({
      title: "Delete Unit Type",
      text: `Delete "${name}"? This cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Yes, delete",
    });
    if (!confirm.isConfirmed) return;

    setProcessingId(id);
    try {
      const res = await SecureFrontendAuthHelper.authenticatedFetch(`/api/unit_type?id=${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        Swal.fire("Deleted", `"${name}" removed.`, "success");
        refreshList();
      } else {
        throw new Error(json.message);
      }
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setProcessingId(null);
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // Color mapping modal
  // ─────────────────────────────────────────────────────────────────────
  const loadUnitTypeOptions = async () => {
    const res = await SecureFrontendAuthHelper.authenticatedFetch("/api/unit_type?limit=100");
    const json = await res.json();
    if (json.success) setUnitTypeOptions(json.data);
  };

  const handleColorFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setColorModalError("Please upload a PDF file.");
      return;
    }
    setPdfFile(file);
    setColorModalError(null);
    setExtractedColors([]);
    setColorModalLoading(true);
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    setPdfPreviewUrl(URL.createObjectURL(file));

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/pdf-debug", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Failed to extract colors");
      const blocks = await response.json();

      const colorMap = new Map();
      for (const block of blocks) {
        const color = block.color.toLowerCase();
        if (!colorMap.has(color) && block.text?.trim()) {
          colorMap.set(color, { sampleText: block.text.trim() });
        }
      }
      const unique = Array.from(colorMap.entries()).map(([color, data]) => ({
        color,
        sampleText: data.sampleText,
        selectedTypeId: null,
      }));
      setExtractedColors(unique);
    } catch (err) {
      setColorModalError(err.message);
    } finally {
      setColorModalLoading(false);
    }
  };

  const saveColorMappings = async () => {
    const mappings = extractedColors.filter(c => c.selectedTypeId);
    if (mappings.length === 0) {
      setColorModalError("Select at least one unit type for a color.");
      return;
    }
    setColorModalLoading(true);
    try {
      const res = await SecureFrontendAuthHelper.authenticatedFetch("/api/unit-type-color", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: mappings.map(m => ({ color: m.color, unitTypeId: m.selectedTypeId })) }),
      });
      const json = await res.json();
      if (json.success) {
        Swal.fire("Success", "Color mappings saved!", "success");
        setShowColorModal(false);
        setPdfFile(null);
        setExtractedColors([]);
        refreshList();
      } else {
        throw new Error(json.message);
      }
    } catch (err) {
      setColorModalError(err.message);
    } finally {
      setColorModalLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────
  const hasPermission = can("unit_type", "read");
  if (!hasPermission) return <AccessDenied requiredPermission="unit_type:read" resourceName="unit type management" />;

  // Filtered and sorted list (client‑side for simplicity)
  const filteredTypes = unitTypes.filter(t =>
    params.name ? t.name.toLowerCase().includes(params.name.toLowerCase()) : true
  );
  const sortedTypes = [...filteredTypes].sort((a, b) => {
    const aRestricted = isRestrictedUnitType(a.name);
    const bRestricted = isRestrictedUnitType(b.name);
    if (aRestricted && !bRestricted) return -1;
    if (!aRestricted && bRestricted) return 1;
    return a.name.localeCompare(b.name);
  });
  const paginatedTypes = sortedTypes.slice((params.page - 1) * params.limit, params.page * params.limit);
  const totalItems = filteredTypes.length;
  const totalPages = Math.ceil(totalItems / params.limit);

  // Pagination controls
  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setParams(prev => ({ ...prev, page: newPage }));
  };
  const handleLimitChange = (newLimit) => {
    setParams(prev => ({ ...prev, limit: newLimit, page: 1 }));
  };
  const handleSearch = () => {
    setParams(prev => ({ ...prev, name: inputName, page: 1 }));
    refreshList();
  };
  const resetFilters = () => {
    setInputName("");
    setParams({ name: "", page: 1, limit: 10 });
    refreshList();
  };

  return (
    <ConditionalRequireAuth>
      <PageLoadingWrapper
        requiredPermission={{ resource: "unit_type", action: "read" }}
        resourceName="unit type management"
        isLoading={isLoading}
        loadingText="Loading unit types..."
        error={pageError}
        errorMessage="Failed to load unit types"
      >
        <div className={`min-h-screen ${theme === "dark" ? "bg-gray-900 text-gray-100" : "bg-white text-gray-900"}`}>
          {/* Form Modal (Create/Edit/View) */}
          {showForm && (
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setShowForm(false)}
            >
              <div
                ref={formRef}
                className="bg-white rounded-2xl max-w-md w-full shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-5 border-b flex justify-between items-center">
                  <h2 className="text-xl font-semibold">
                    {formMode === "ADD" ? "Add Unit Type" : formMode === "EDIT" ? "Edit Unit Type" : "View Unit Type"}
                  </h2>
                  <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                </div>
                <form onSubmit={handleFormSubmit} className="p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#cc2131]/30"
                      disabled={formMode === "VIEW"}
                      required
                    />
                    {isRestrictedUnitType(formData.name) && formMode === "EDIT" && (
                      <p className="text-xs text-blue-600 mt-1">System type – only colour can be changed.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Primary Colour</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={formData.colour}
                        onChange={(e) => setFormData({ ...formData, colour: e.target.value })}
                        disabled={formMode === "VIEW"}
                        className="w-10 h-10 rounded border"
                      />
                      <input
                        type="text"
                        value={formData.colour}
                        onChange={(e) => setFormData({ ...formData, colour: e.target.value })}
                        className="flex-1 border rounded px-3 py-2 font-mono text-sm"
                        disabled={formMode === "VIEW"}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
                      Cancel
                    </button>
                    {formMode !== "VIEW" && (
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="px-4 py-2 bg-[#cc2131] text-white rounded-lg hover:bg-[#b01d2c] disabled:opacity-50"
                      >
                        {isSaving ? "Saving..." : formMode === "ADD" ? "Create" : "Save Changes"}
                      </button>
                    )}
                    {formMode === "VIEW" && can("unit_type", "update") && (
                      <button
                        type="button"
                        onClick={() => openForm("EDIT", selectedUnitType)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Edit
                      </button>
                    )}
                    {formMode === "VIEW" && can("unit_type", "delete") && !isRestrictedUnitType(selectedUnitType?.name) && (
                      <button
                        type="button"
                        onClick={() => handleDelete(selectedUnitType.id, selectedUnitType.name)}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Main content */}
          <div className="p-4 md:p-6 max-w-7xl mx-auto">
            <h1 className="text-2xl md:text-3xl font-bold mb-6">Unit Type Management</h1>

            {/* Search & Action Bar */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="flex-1 border rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#cc2131]/30"
                />
                <button onClick={handleSearch} className="px-4 py-2 bg-[#cc2131] text-white rounded-lg hover:bg-[#b01d2c]">
                  Search
                </button>
                <button onClick={resetFilters} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
                  Reset
                </button>
              </div>
              <div className="flex gap-2">
                {can("unit_type", "create") && (
                  <button onClick={() => openForm("ADD")} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    + Add Unit Type
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowColorModal(true);
                    loadUnitTypeOptions();
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Upload Planner Design
                </button>
              </div>
            </div>

            {/* Unit Types Table */}
            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Color</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedTypes.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-4 py-8 text-center text-gray-500">
                        No unit types found.
                      </td>
                    </tr>
                  ) : (
                    paginatedTypes.map((type, idx) => (
                      <tr key={type.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openForm("VIEW", type)}>
                        <td className="px-4 py-2 text-sm text-gray-500">{(params.page - 1) * params.limit + idx + 1}</td>
                        <td className="px-4 py-2 font-medium">
                          {type.name}
                          {isRestrictedUnitType(type.name) && (
                            <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">System</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: type.colour }}></div>
                            <span className="text-xs font-mono">{type.colour}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); openForm("VIEW", type); }}
                              className="text-blue-600 hover:text-blue-800"
                              title="View"
                            >
                              👁️
                            </button>
                            {can("unit_type", "update") && (
                              <button
                                onClick={(e) => { e.stopPropagation(); openForm("EDIT", type); }}
                                className="text-indigo-600 hover:text-indigo-800"
                                title="Edit"
                              >
                                ✏️
                              </button>
                            )}
                            {can("unit_type", "delete") && !isRestrictedUnitType(type.name) && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(type.id, type.name); }}
                                disabled={processingId === type.id}
                                className="text-red-600 hover:text-red-800"
                                title="Delete"
                              >
                                {processingId === type.id ? "⌛" : "🗑️"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalItems > 0 && (
              <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Rows per page:</span>
                  <select
                    value={params.limit}
                    onChange={(e) => handleLimitChange(Number(e.target.value))}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                  </select>
                </div>
                <div className="text-sm text-gray-500">
                  Showing {(params.page - 1) * params.limit + 1} to {Math.min(params.page * params.limit, totalItems)} of {totalItems}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange(params.page - 1)}
                    disabled={params.page === 1}
                    className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 bg-gray-100 rounded">Page {params.page} of {totalPages}</span>
                  <button
                    onClick={() => handlePageChange(params.page + 1)}
                    disabled={params.page === totalPages}
                    className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Color Mapping Modal */}
          {showColorModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowColorModal(false)}>
              <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 bg-white border-b px-5 py-3 flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Map PDF Colours to Unit Types</h3>
                  <button onClick={() => setShowColorModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                </div>
                <div className="p-5">
                  {colorModalError && <p className="text-red-600 text-sm mb-3">{colorModalError}</p>}
                  <label className="block mb-4">
                    <span className="font-medium">Upload Study Planner PDF</span>
                    <input type="file" accept="application/pdf" onChange={handleColorFileChange} className="mt-1 block w-full border rounded p-2" />
                  </label>
                  {pdfFile && (
                    <div className="grid md:grid-cols-2 gap-6 mt-4">
                      <div>
                        <p className="font-medium mb-2">Extracted Colours ({extractedColors.length})</p>
                        {colorModalLoading && <p className="text-gray-500">Processing...</p>}
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {extractedColors.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-2 border rounded">
                              <div className="w-10 h-10 rounded border" style={{ backgroundColor: item.color }}></div>
                              <div className="flex-1">
                                <code className="text-xs">{item.color}</code>
                                <p className="text-xs text-gray-500 truncate">{item.sampleText}</p>
                              </div>
                              <select
                                value={item.selectedTypeId || ""}
                                onChange={(e) => {
                                  const newColors = [...extractedColors];
                                  newColors[idx].selectedTypeId = parseInt(e.target.value);
                                  setExtractedColors(newColors);
                                }}
                                className="border rounded px-2 py-1 text-sm"
                              >
                                <option value="">-- Ignore --</option>
                                {unitTypeOptions.map(t => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex justify-end gap-3">
                          <button onClick={() => setShowColorModal(false)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
                          <button onClick={saveColorMappings} disabled={colorModalLoading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            Save Mappings
                          </button>
                        </div>
                      </div>
                      <div className="border rounded p-3 bg-gray-50">
                        <p className="text-sm font-medium mb-2">PDF Preview</p>
                        {pdfPreviewUrl ? (
                          <iframe src={`${pdfPreviewUrl}#toolbar=0`} className="w-full h-96 border rounded" title="Preview" />
                        ) : (
                          <div className="w-full h-96 flex items-center justify-center text-gray-400 bg-gray-100 rounded">
                            No preview
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </PageLoadingWrapper>
    </ConditionalRequireAuth>
  );
}