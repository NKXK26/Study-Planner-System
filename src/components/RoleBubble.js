import { useState, useRef, useEffect } from "react";
import { UserCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";

function RoleBubble({
  allRoles,
  selectedRoleName,
  setSelectedRoleByName,
  resetOverride,
  canUserSwitchRoles,
  isAuthenticated,
}) {
  const [open, setOpen] = useState(false);
  const bubbleRef = useRef(null);

  const showBubble =
    (isAuthenticated && canUserSwitchRoles) ||
    (typeof window !== "undefined" &&
      localStorage.getItem("devRoleOverride") === "1") ||
    process.env.NEXT_PUBLIC_MODE === "DEV";

  // Close bubble when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  if (!showBubble) return null;

  return (
    <div className="sm:hidden fixed bottom-5 right-5 z-50" ref={bubbleRef}>
      {/* Bubble toggle button with tooltip */}
      {!open && (
        <div className="relative group">
          <button
            onClick={() => setOpen(!open)}
            className="w-12 h-12 rounded-full bg-[#dc2d27] text-white flex items-center justify-center shadow-lg"
          >
            <UserCircleIcon className="h-6 w-6" />
          </button>
          {/* Tooltip */}
          <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition bg-gray-800 text-white text-xs rounded px-2 py-1 pointer-events-none whitespace-nowrap shadow-md">
            Switch Role
          </span>
        </div>
      )}

      {/* Expanded bubble content */}
      {open && (
        <div className="mt-2 p-3 bg-white rounded-xl shadow-xl w-64 flex flex-col gap-2">
          {/* Header with label + close icon */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              {typeof window !== "undefined" &&
              localStorage.getItem("devRoleOverride") === "1"
                ? "Viewing as:"
                : process.env.NEXT_PUBLIC_MODE === "DEV"
                ? "DEV Role:"
                : "Role:"}
            </label>
            <XMarkIcon
              className="h-5 w-5 text-gray-500 cursor-pointer hover:text-gray-700"
              onClick={() => setOpen(false)}
            />
          </div>

          <select
            className="text-sm px-3 py-1 border rounded-md"
            value={selectedRoleName || ""}
            onChange={(e) => setSelectedRoleByName(e.target.value)}
          >
            {allRoles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          {typeof window !== "undefined" &&
            localStorage.getItem("devRoleOverride") === "1" && (
              <button
                onClick={resetOverride}
                className="text-xs px-2 py-1 rounded bg-yellow-200 hover:bg-yellow-300 text-yellow-800 font-medium"
              >
                Reset to Actual Role
              </button>
            )}
        </div>
      )}
    </div>
  );
}

export default RoleBubble;
