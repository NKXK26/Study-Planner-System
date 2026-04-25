import React from "react";

const variants = {
    submit:"bg-green-500 text-white",
    cancel:"bg-[#dc2d27] text-white ",
    edit:"bg-white text-black border-2 border-solid",
    confirm:"bg-white text-black border-2 border-solid",
    close:"bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
}
export default function Button({
    children,
    type="button",
    onClick,
    variant = "submit",
    className = "",
}) {
    return(
        <button
            type={type}
            onClick={onClick}
            className={`mx-3 px-4 py-2 rounded-xl cursor-pointer ${variants[variant]} ${className}`}
        >
            {children}
        </button>
    )
}