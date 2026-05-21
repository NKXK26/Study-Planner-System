import { useState } from 'react';
import {
  Bars3Icon,
  XMarkIcon,
  PlusIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import {
  REQUIRED_CORE,
  REQUIRED_MAJOR,
  REQUIRED_ELECTIVE,
  TOTAL_REQUIRED_UNITS,
  TOTAL_REQUIRED_CREDITS,
  DEFAULT_CREDIT_POINTS,
  MAX_UNITS_PER_SEMESTER,
  MAX_CREDITS_PER_SEMESTER,
  getRemainingRequirements,
  getNormalizedUnitCode,
  getUnitCategory,
  extractUnitCode,
  calculateCompletedCredits,
  parsePrerequisites,
  scheduleRemainingUnits,
  optimizeFinalSemester,
  compactFinalSemesters,
  // ... any other needed functions
} from './plannerHelpers';

export const CategoryBadge = ({ category }) => {
  const label = { core: 'Core', elective: 'Elective', major: 'Major', mpu: 'MPU', wil: 'WIL' };
  const colorMap = {
    core: 'text-blue-700 border-blue-300',
    major: 'text-amber-700 border-amber-300',
    elective: 'text-emerald-700 border-emerald-300',
    wil: 'text-pink-700 border-pink-300',
    mpu: 'text-amber-700 border-amber-300',
  };
  const defaultStyle = 'text-gray-600 border-gray-300';
  const style = colorMap[category] || defaultStyle;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium bg-white ${style}`}>
      {label[category] || category}
    </span>
  );
};

export const DraggableUnitCard = ({ unit, semIdx, unitIdx, onDragStart, onDragEnter, onDrop, isDragOver, isSource, onRemove, compact = false }) => {
  const cat = getUnitCategory(unit);
  const code = extractUnitCode(unit.UnitCode || unit.code || '');
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ unit, fromToolbox: false }));
        onDragStart({ semIdx, unitIdx, unit, fromPanel: false });
      }}
      onDragEnter={() => onDragEnter({ semIdx, unitIdx })}
      onDragOver={e => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop({ semIdx, unitIdx });
      }}
      className={`
        group relative flex items-center gap-2 px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing
        transition-all duration-150 select-none
        ${isSource ? 'opacity-40 scale-95 border-dashed border-gray-300 bg-gray-50' : ''}
        ${isDragOver && !isSource ? 'border-emerald-400 bg-emerald-50 shadow-md scale-[1.02]' : ''}
        ${!isSource && !isDragOver ? 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm' : ''}
      `}
    >
      <Bars3Icon className="h-3.5 w-3.5 text-gray-300 flex-shrink-0 group-hover:text-gray-400" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono font-semibold text-gray-800 text-xs">{code}</span>
          <CategoryBadge category={cat} />
        </div>
        {!compact && unit.Name && <p className="text-xs text-gray-500 mt-0.5 truncate">{unit.Name}</p>}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-xs text-red-600 font-semibold ml-auto">{unit.CreditPoints || DEFAULT_CREDIT_POINTS}CP</span>
        {onRemove && (
          <button
            onClick={e => { e.stopPropagation(); onRemove(semIdx, unitIdx); }}
            className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export const PanelUnitCard = ({ unit, status, onDragStart, isDragging, onRemove, category }) => {
  const code = extractUnitCode(unit.UnitCode || unit.code || '');
  const isMapped = unit.isMappedExternal;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ unit, fromToolbox: false, fromPanel: true, category }));
        onDragStart({ unit, fromPanel: true, category });
      }}
      onDragOver={e => e.preventDefault()}
      className={`
        group flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-500 cursor-grab active:cursor-grabbing
        transition-all duration-150 select-none bg-white
        ${isDragging ? 'opacity-40 border-dashed border-red-300 bg-gray-50' : 'hover:border-red-600 hover:shadow-sm'}
      `}
    >
      <Bars3Icon className="h-3.5 w-3.5 text-gray-300 flex-shrink-0 mt-0.5 group-hover:text-red-500" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className="font-mono font-semibold text-gray-800 text-xs">{code}</span>
          <CategoryBadge category={category} />
          {status === 'completed' && <span className="text-xs text-green-700 border border-green-300 bg-white px-1.5 py-0.5 rounded-full">✓ Completed</span>}
          {isMapped && <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">Mapped</span>}
          {unit.doubleCount && <span className="text-xs text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded-full">2x</span>}
          <span className="text-xs text-red-600 font-semibold ml-auto">{unit.CreditPoints || DEFAULT_CREDIT_POINTS}CP</span>
        </div>
        {unit.Name && <p className="text-xs text-gray-500 leading-snug">{unit.Name}</p>}
        {unit.Prerequisites && unit.Prerequisites !== 'Nil' && unit.Prerequisites !== 'nil' && !isMapped && (
          <p className="text-xs text-amber-600 mt-1 leading-snug">Pre: {unit.Prerequisites}</p>
        )}
      </div>
      {onRemove && isMapped && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(unit); }}
          className="ml-1 opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

export const ExternalUnitCard = ({ unit, onMapToCategory }) => {
  const [showMenu, setShowMenu] = useState(false);
  const categories = [
    { id: 'core', label: 'Core' },
    { id: 'major', label: 'Major' },
    { id: 'elective', label: 'Elective' },
    { id: 'wil', label: 'WIL' }
  ];
  const handleMap = (category) => { onMapToCategory(category, unit); setShowMenu(false); };
  return (
    <div className="relative bg-white rounded-lg border border-red-200 p-3 hover:border-red-400 hover:shadow-md transition-all cursor-pointer">
      <div onClick={() => setShowMenu(!showMenu)}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-gray-800">{unit.code}</span>
              <span className="text-xs text-red-600 font-semibold ml-auto">{unit.CreditPoints || DEFAULT_CREDIT_POINTS}CP</span>
            </div>
            {unit.name && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{unit.name}</p>}
          </div>
          <ChevronRightIcon className={`h-4 w-4 text-gray-400 transition-transform flex-shrink-0 ml-2 ${showMenu ? 'rotate-90' : ''}`} />
        </div>
      </div>
      {showMenu && (
        <div className="mt-3 pt-2 border-t border-gray-200 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => handleMap(cat.id)} className="text-xs px-3 py-1.5 rounded-md bg-white border border-red-300 text-red-600 hover:bg-red-50 transition-colors font-medium">
              Map to {cat.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const SemesterDropZone = ({ sem, semIdx, onDragEnter, onDrop, onNativeDrop, isDragOver }) => (
  <div
    onDragEnter={() => onDragEnter({ semIdx, unitIdx: sem.units.length })}
    onDragOver={e => e.preventDefault()}
    onDrop={(e) => {
      e.preventDefault();
      try {
        const raw = e.dataTransfer.getData('application/json');
        if (raw) {
          const data = JSON.parse(raw);
          if (data.fromToolbox && data.unit) {
            onNativeDrop(semIdx, sem.units.length, data.unit);
            return;
          }
        }
      } catch (_) { }
      onDrop({ semIdx, unitIdx: sem.units.length });
    }}
    className={`mt-2 border-2 border-dashed rounded-lg p-2 text-center text-xs transition-all
      ${isDragOver ? 'border-emerald-500 bg-emerald-100 text-emerald-600' : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500 hover:bg-gray-50'}`}
  >
    <PlusIcon className="h-3.5 w-3.5 inline mr-1" /> Drop unit here
  </div>
);