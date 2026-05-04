'use client';
import Tooltip from './Tooltip';

/**
 * InfoTooltip Component - A tooltip with a beautiful info icon
 * 
 * Usage:
 * <InfoTooltip content="This is helpful information for the user" />
 * 
 * Or inline with text:
 * <label>
 *   Name: <InfoTooltip content="Enter your full name" />
 * </label>
 */
const InfoTooltip = ({ content, position = 'top', className = '' }) => {
    return (
        <Tooltip content={content} position={position}>
            <button
                type="button"
                className={`info-tooltip-button ${className}`}
                aria-label="Information"
            >
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="info-icon"
                >
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <circle cx="12" cy="8" r="0.5" fill="currentColor"></circle>
                </svg>
            </button>
        </Tooltip>
    );
};

export default InfoTooltip;

