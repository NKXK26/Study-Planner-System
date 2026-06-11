'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  TrashIcon,
  PencilIcon,
  PlusIcon,
  CheckIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  DocumentDuplicateIcon,
  AcademicCapIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

// ─── Toast Notification ──────────────────────────────────────────────────────
function Toast({ message, type, visible }) {
  if (!visible) return null;
  const colours =
    type === 'error'
      ? 'bg-red-50 border-red-200 text-red-700'
      : 'bg-emerald-50 border-emerald-200 text-emerald-700';
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-5 py-3 rounded-xl border shadow-lg text-sm font-medium transition-all duration-300 ${colours}`}
    >
      {type === 'error' ? (
        <XMarkIcon className="h-4 w-4 shrink-0" />
      ) : (
        <CheckIcon className="h-4 w-4 shrink-0" />
      )}
      {message}
    </div>
  );
}

// ─── Add Unit Type Popup ─────────────────────────────────────────────────────
// FIX: Rendered in a portal-like fixed overlay (z-[200]) so it always appears
// above the modal (z-50). No longer depends on anchorRef positioning.
function AddUnitTypePopup({ isOpen, onClose, onAdd }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setValue('');
      // Small delay so the element is visible before focusing
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAdd = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    onClose();
  };

  return (
    // z-[200] ensures it sits above the modal's z-50
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Add unit type</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="e.g. Elective, Core, Major…"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#cc2131]/25 focus:border-[#cc2131] transition-all mb-4"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!value.trim()}
            className="px-3 py-1.5 text-sm bg-[#cc2131] hover:bg-[#b01d2c] disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Requirement Row ─────────────────────────────────────────────────────────
function RequirementRow({ category, count, onCountChange, onRemove }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-sm text-gray-700 font-medium truncate">{category}</span>
      <input
        type="number"
        min={0}
        value={count}
        onChange={(e) => onCountChange(Math.max(0, parseInt(e.target.value) || 0))}
        className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#cc2131]/25 focus:border-[#cc2131]"
      />
      <span className="text-xs text-gray-400 w-8 shrink-0">units</span>
      <button
        onClick={onRemove}
        className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        title={`Remove ${category}`}
      >
        <XMarkIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Template Form Modal (Create / Edit) ─────────────────────────────────────
function TemplateFormModal({ isOpen, onClose, initialData, onSave, showToast }) {
  const [name, setName] = useState('');
  const [requirements, setRequirements] = useState({});
  const [loading, setLoading] = useState(false);
  // FIX: popupOpen state lives here and is passed down to AddUnitTypePopup
  const [popupOpen, setPopupOpen] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setName(initialData.name);
        setRequirements({ ...initialData.requirements });
      } else {
        setName('');
        setRequirements({ Core: 10, Major: 18, Elective: 4 });
      }
      // Close any leftover popup when modal opens
      setPopupOpen(false);
    }
  }, [isOpen, initialData]);

  useEffect(() => {
    const handleEscape = (e) => {
      // Only close the modal if the popup isn't open
      if (e.key === 'Escape' && isOpen && !popupOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, popupOpen]);

  if (!isOpen) return null;

  const updateRequirement = (cat, value) => {
    setRequirements((prev) => ({ ...prev, [cat]: value }));
  };

  const removeRequirement = (cat) => {
    const newReqs = { ...requirements };
    delete newReqs[cat];
    setRequirements(newReqs);
  };

  // FIX: handleAddUnitType correctly adds new category with default count 0
  const handleAddUnitType = (newCat) => {
    if (!requirements.hasOwnProperty(newCat)) {
      setRequirements((prev) => ({ ...prev, [newCat]: 0 }));
    } else {
      showToast(`"${newCat}" already exists.`, 'error');
    }
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast('Please enter a programme name.', 'error');
      return;
    }
    if (Object.keys(requirements).length === 0) {
      showToast('Please add at least one graduation requirement.', 'error');
      return;
    }
    setLoading(true);
    try {
      const payload = { name: trimmedName, requirements };
      if (initialData) {
        const res = await SecureFrontendAuthHelper.authenticatedFetch('/api/planner-templates', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: initialData.id, ...payload }),
        });
        if (res.ok) {
          await onSave();
          showToast('Template updated successfully.', 'success');
          onClose();
        } else {
          const err = await res.json();
          showToast(err.message || 'Failed to update template.', 'error');
        }
      } else {
        const res = await SecureFrontendAuthHelper.authenticatedFetch('/api/planner-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          await onSave();
          showToast('Template created successfully.', 'success');
          onClose();
        } else {
          const err = await res.json();
          showToast(err.message || 'Failed to create template.', 'error');
        }
      }
    } catch {
      showToast('Network error. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const totalUnits = Object.values(requirements).reduce((sum, n) => sum + Number(n), 0);

  return (
    <>
      {/* Modal backdrop — z-50 */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          ref={modalRef}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {initialData ? 'Edit Programme' : 'Create New Template'}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {initialData ? 'Modify graduation requirements' : 'Define degree structure'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            {/* Programme name */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Programme name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bachelor of Computer Science"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#cc2131]/25 focus:border-[#cc2131] transition-all"
                autoFocus
              />
            </div>

            {/* Requirements */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Graduation requirements
                </label>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  Total: {totalUnits} units
                </span>
              </div>
              <div className="space-y-2.5 bg-gray-50 rounded-xl p-3 border border-gray-100">
                {Object.entries(requirements).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No requirements added yet</p>
                ) : (
                  Object.entries(requirements).map(([cat, count]) => (
                    <RequirementRow
                      key={cat}
                      category={cat}
                      count={count}
                      onCountChange={(v) => updateRequirement(cat, v)}
                      onRemove={() => removeRequirement(cat)}
                    />
                  ))
                )}
                {/* FIX: button uses type="button" to prevent any accidental form submission
                    and calls setPopupOpen(true) with e.stopPropagation() so the modal
                    backdrop onClick doesn't fire simultaneously */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPopupOpen(true);
                  }}
                  className="mt-2 text-sm text-[#cc2131] hover:underline flex items-center gap-1.5 font-medium"
                >
                  <PlusIcon className="h-3.5 w-3.5" /> Add unit type
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-100 px-6 py-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-white transition-colors text-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-[#cc2131] hover:bg-[#b01d2c] disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {loading ? (
                <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckIcon className="h-4 w-4" />
              )}
              {initialData ? 'Save changes' : 'Create template'}
            </button>
          </div>
        </div>
      </div>

      {/* AddUnitTypePopup rendered OUTSIDE the modal div so z-index stacking is clean */}
      <AddUnitTypePopup
        isOpen={popupOpen}
        onClose={() => setPopupOpen(false)}
        onAdd={handleAddUnitType}
      />
    </>
  );
}

// ─── Template Card ───────────────────────────────────────────────────────────
function TemplateCard({ template, onEdit, onDelete, onDuplicate, processingId }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  // FIX: Guard against missing/malformed requirements gracefully
  const reqs = template.requirements && typeof template.requirements === 'object'
    ? template.requirements
    : {};
  const total = Object.values(reqs).reduce((s, n) => s + Number(n), 0);
  const reqEntries = Object.entries(reqs);

  const isProcessing = processingId === template.id;

  return (
    <div className="group bg-white border border-gray-200 rounded-2xl hover:shadow-lg hover:border-gray-300 transition-all duration-200 overflow-hidden">
      <div className="p-5">
        {/* Card header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900 leading-tight line-clamp-2">
              {template.name}
            </h3>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Duplicate */}
            <button
              type="button"
              onClick={() => onDuplicate(template)}
              disabled={isProcessing}
              className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40"
              title="Duplicate template"
            >
              <DocumentDuplicateIcon className="h-4 w-4" />
            </button>
            {/* Edit */}
            <button
              type="button"
              onClick={() => onEdit(template)}
              disabled={isProcessing}
              className="p-1.5 rounded-lg text-gray-400 hover:text-[#cc2131] hover:bg-red-50 transition-colors disabled:opacity-40"
              title="Edit template"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
            {/* Delete / confirm */}
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={isProcessing}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                title="Delete template"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            ) : (
              <div className="flex items-center gap-1 bg-red-50 rounded-lg px-1.5 py-1">
                <span className="text-[11px] font-medium text-red-600">Delete?</span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDelete(false);
                    onDelete(template.id, template.name);
                  }}
                  className="px-1.5 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-1.5 py-0.5 text-xs border border-gray-200 rounded bg-white hover:bg-gray-50 transition-colors"
                >
                  No
                </button>
              </div>
            )}
          </div>
        </div>

        {/* FIX: Requirements badges — show "No requirements" when empty instead of nothing */}
        <div className="flex flex-wrap gap-1.5 mb-4 min-h-[1.5rem]">
          {reqEntries.length === 0 ? (
            <span className="text-xs text-gray-400 italic">No requirements defined</span>
          ) : (
            <>
              {reqEntries.slice(0, 5).map(([cat, count]) => (
                <span
                  key={cat}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 border border-gray-200"
                >
                  <span>{cat}</span>
                  <span className="font-semibold text-gray-900">{count}</span>
                </span>
              ))}
              {reqEntries.length > 5 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
                  +{reqEntries.length - 5} more
                </span>
              )}
            </>
          )}
        </div>

        {/* Card footer */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <AcademicCapIcon className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs font-medium text-gray-700">{total} total units</span>
          </div>
          {template.createdAt && (
            <span className="text-xs text-gray-400">
              {new Date(template.createdAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────────
export default function PlannerTemplateManager() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [toast, setToast] = useState({ message: '', type: 'success', visible: false });
  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type, visible: true });
    toastTimer.current = setTimeout(
      () => setToast((prev) => ({ ...prev, visible: false })),
      2800
    );
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await SecureFrontendAuthHelper.authenticatedFetch('/api/planner-templates');
      const json = await res.json();
      if (json.success) setTemplates(json.data);
      else showToast(json.message || 'Failed to load templates.', 'error');
    } catch (err) {
      console.error(err);
      showToast('Failed to load templates.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setModalOpen(true);
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setModalOpen(true);
  };

  const handleDelete = async (id, name) => {
    setProcessingId(id);
    try {
      const res = await SecureFrontendAuthHelper.authenticatedFetch(
        `/api/planner-templates?id=${id}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        await fetchTemplates();
        showToast(`"${name}" deleted.`, 'success');
      } else {
        const err = await res.json();
        showToast(err.message || 'Failed to delete template.', 'error');
      }
    } catch {
      showToast('Network error. Please try again.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDuplicate = async (template) => {
    setProcessingId(template.id);
    try {
      const newName = `${template.name} (Copy)`;
      const res = await SecureFrontendAuthHelper.authenticatedFetch('/api/planner-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, requirements: template.requirements }),
      });
      if (res.ok) {
        await fetchTemplates();
        showToast(`"${newName}" created.`, 'success');
      } else {
        const err = await res.json();
        showToast(err.message || 'Failed to duplicate template.', 'error');
      }
    } catch {
      showToast('Network error. Please try again.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleModalSave = async () => {
    await fetchTemplates();
  };

  const filteredTemplates = searchQuery.trim()
    ? templates.filter((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : templates;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">

        {/* Header */}
        <div className="mb-8 md:mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ClipboardDocumentListIcon className="h-7 w-7 text-[#cc2131]" />
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                  Study Planner Templates
                </h1>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Manage degree programme templates and their graduation unit requirements.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCreate}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#cc2131] hover:bg-[#b01d2c] text-white text-sm font-semibold rounded-xl shadow-sm transition-all active:scale-95"
            >
              <PlusIcon className="h-4 w-4" />
              New template
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-8">
          <div className="relative max-w-md">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search templates by name…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#cc2131]/25 focus:border-[#cc2131] bg-white shadow-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {filteredTemplates.length}{' '}
            {filteredTemplates.length === 1 ? 'template' : 'templates'} found
          </p>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 animate-pulse">
                <div className="h-5 bg-gray-200 rounded-lg w-3/4 mb-3"></div>
                <div className="flex gap-1.5 mb-4">
                  <div className="h-5 bg-gray-100 rounded-full w-14"></div>
                  <div className="h-5 bg-gray-100 rounded-full w-14"></div>
                  <div className="h-5 bg-gray-100 rounded-full w-14"></div>
                </div>
                <div className="h-8 bg-gray-50 rounded-lg w-full"></div>
              </div>
            ))}
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-dashed border-gray-200 gap-3">
            <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
              <DocumentDuplicateIcon className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">
              {searchQuery
                ? `No templates matching "${searchQuery}"`
                : 'No templates yet. Create your first template.'}
            </p>
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-[#cc2131] hover:underline font-medium"
              >
                Clear search
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreate}
                className="mt-2 text-sm text-[#cc2131] hover:underline flex items-center gap-1 font-medium"
              >
                <PlusIcon className="h-3.5 w-3.5" /> Create new template
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTemplates.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                processingId={processingId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      <TemplateFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialData={editingTemplate}
        onSave={handleModalSave}
        showToast={showToast}
      />

      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </div>
  );
}