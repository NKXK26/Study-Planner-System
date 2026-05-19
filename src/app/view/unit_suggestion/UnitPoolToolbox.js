'use client';
import { useState, useEffect, useRef } from 'react';
import Draggable from 'react-draggable';
import {
    XMarkIcon,
    MagnifyingGlassIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    Bars3Icon,
    InformationCircleIcon,
} from '@heroicons/react/24/outline';
import {
    extractUnitCode,
    getUnitCategory,
    CategoryBadge,
} from '../../libs/studyPlannerUtils';

function getPlannerField(name) {
    const lower = name.toLowerCase();
    if (lower.includes('cssd')) return 'Software Dev';
    if (lower.includes('cscs')) return 'Cybersecurity';
    if (lower.includes('csiot')) return 'IoT';
    if (lower.includes('csds')) return 'Data Science';
    if (lower.includes('csai')) return 'AI';
    return 'Other';
}

const UnitPoolToolbox = ({ isOpen, onClose, onDragStart }) => {
    const [loading, setLoading] = useState(true);
    const [allPlanners, setAllPlanners] = useState([]);
    const [groupedUnits, setGroupedUnits] = useState([]);
    const [filteredUnits, setFilteredUnits] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTypes, setSelectedTypes] = useState({ core: true, major: true, elective: true });
    const [selectedFields, setSelectedFields] = useState({
        'Software Dev': true,
        Cybersecurity: true,
        'Data Science': true,
        IoT: true,
        AI: true,
        Other: true,
    });
    const [isExpanded, setIsExpanded] = useState(true);
    const nodeRef = useRef(null);

    // Fetch all planners
    useEffect(() => {
        if (!isOpen) return;
        fetch('/api/study-planner', { headers: { 'x-dev-override': 'true' } })
            .then(r => r.json())
            .then(json => {
                if (json.success) {
                    setAllPlanners(json.data || []);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [isOpen]);

    // Group units by code, merging planners
    useEffect(() => {
        if (!allPlanners.length) {
            setGroupedUnits([]);
            return;
        }
        const codeMap = new Map(); // key: unit code (uppercase)

        for (const planner of allPlanners) {
            const field = getPlannerField(planner.name);
            for (const unit of (planner.units || [])) {
                const code = extractUnitCode(unit.UnitCode);
                if (!code) continue;
                const existing = codeMap.get(code);
                const unitType = getUnitCategory(unit);
                if (!existing) {
                    codeMap.set(code, {
                        code,
                        name: unit.Name,
                        creditPoints: unit.CreditPoints || 12.5,
                        unitType,
                        firstRawUnit: unit, // from the first planner encountered
                        planners: new Set([{ name: planner.name, field }]),
                    });
                } else {
                    // Add this planner to the set
                    existing.planners.add({ name: planner.name, field });
                }
            }
        }

        // Convert map to array
        const grouped = Array.from(codeMap.values()).map(item => ({
            ...item,
            planners: Array.from(item.planners),
        }));
        setGroupedUnits(grouped);
    }, [allPlanners]);

    // Apply filters
    useEffect(() => {
        let result = [...groupedUnits];
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(u =>
                u.code.toLowerCase().includes(term) ||
                u.name.toLowerCase().includes(term)
            );
        }
        const activeTypes = Object.keys(selectedTypes).filter(k => selectedTypes[k]);
        if (activeTypes.length && activeTypes.length < 3) {
            result = result.filter(u => activeTypes.includes(u.unitType));
        }
        const activeFields = Object.keys(selectedFields).filter(k => selectedFields[k]);
        if (activeFields.length && activeFields.length < Object.keys(selectedFields).length) {
            result = result.filter(u =>
                u.planners.some(p => activeFields.includes(p.field))
            );
        }
        setFilteredUnits(result);
    }, [groupedUnits, searchTerm, selectedTypes, selectedFields]);

    const handleDragStart = (e, unitGroup) => {
        // Drag the raw unit from the first planner (or we could pick one with a specific field)
        e.dataTransfer.setData('application/json', JSON.stringify({
            unit: unitGroup.firstRawUnit,
            fromToolbox: true,
        }));
        if (onDragStart) onDragStart(unitGroup.firstRawUnit);
    };

    if (!isOpen) return null;

    return (
        <Draggable nodeRef={nodeRef} handle=".drag-handle" bounds="body">
            <div
                ref={nodeRef}
                className="fixed bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col z-[100]"
                style={{ width: '360px', maxWidth: '90vw', right: '20px', top: '150px' }}
            >
                {/* Header */}
                <div className="drag-handle bg-gray-100 rounded-t-xl px-3 py-2 flex justify-between items-center cursor-move border-b border-gray-200">
                    <div className="flex items-center gap-2">
                        <Bars3Icon className="h-4 w-4 text-gray-500" />
                        <h3 className="text-sm font-semibold text-gray-800">Unit Toolbox</h3>
                        <span className="text-xs text-gray-500 bg-gray-200 px-1.5 rounded-full">{filteredUnits.length}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setIsExpanded(!isExpanded)} className="p-1 rounded hover:bg-gray-200">
                            {isExpanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
                        </button>
                        <button onClick={onClose} className="p-1 rounded hover:bg-gray-200">
                            <XMarkIcon className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {isExpanded && (
                    <div className="flex-1 overflow-hidden flex flex-col p-3 gap-3">
                        {/* Search */}
                        <div className="relative">
                            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search unit..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#cc2131]"
                            />
                        </div>

                        {/* Type filters */}
                        <div className="flex gap-1 flex-wrap">
                            {['core', 'major', 'elective'].map(type => (
                                <button
                                    key={type}
                                    onClick={() => setSelectedTypes(prev => ({ ...prev, [type]: !prev[type] }))}
                                    className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize transition-all
                                    ${selectedTypes[type] ? 'bg-[#cc2131] text-white border-[#cc2131]' : 'bg-white text-gray-600 border-gray-200'}`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>

                        {/* Field filters */}
                        <div className="flex gap-1 flex-wrap">
                            {Object.keys(selectedFields).map(field => (
                                <button
                                    key={field}
                                    onClick={() => setSelectedFields(prev => ({ ...prev, [field]: !prev[field] }))}
                                    className={`text-xs px-2 py-0.5 rounded-full border transition-all
                                    ${selectedFields[field] ? 'bg-[#cc2131] text-white border-[#cc2131]' : 'bg-white text-gray-600 border-gray-200'}`}
                                >
                                    {field}
                                </button>
                            ))}
                        </div>

                        {/* Unit list (grouped by code) */}
                        <div className="flex-1 overflow-y-auto max-h-96 space-y-1.5 pr-1">
                            {loading ? (
                                <div className="text-center text-xs text-gray-400 py-4">Loading units...</div>
                            ) : filteredUnits.length === 0 ? (
                                <div className="text-center text-xs text-gray-400 py-4">No units match filters</div>
                            ) : (
                                filteredUnits.map((unitGroup, idx) => {
                                    const uniqueFields = [...new Set(unitGroup.planners.map(p => p.field))];
                                    const fieldList = uniqueFields.join(', ');
                                    const tooltipText = unitGroup.planners.map(p => p.name).join('\n');
                                    return (
                                        <div
                                            key={`${unitGroup.code}-${idx}`}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, unitGroup)}
                                            className="group bg-white border border-gray-200 rounded-lg p-2 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-mono text-xs font-semibold">{unitGroup.code}</span>
                                                    <CategoryBadge category={unitGroup.unitType} />
                                                    {unitGroup.planners.length > 1 && (
                                                        <div className="relative group/tooltip">
                                                            <InformationCircleIcon className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
                                                            <div className="absolute bottom-full left-0 mb-1 hidden group-hover/tooltip:block bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-pre z-10">
                                                                {tooltipText}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-xs text-[#cc2131] font-medium">{unitGroup.creditPoints} CP</span>
                                            </div>
                                            <p className="text-xs text-gray-600 truncate mt-0.5">{unitGroup.name}</p>
                                            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                                <span className="bg-gray-100 px-1.5 py-0.5 rounded">In: {fieldList}</span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <p className="text-[10px] text-gray-400 text-center">Drag any unit into a semester slot</p>
                    </div>
                )}
            </div>
        </Draggable>
    );
};

export default UnitPoolToolbox;