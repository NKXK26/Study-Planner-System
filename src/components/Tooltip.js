'use client';
import { useState, useRef, useEffect } from 'react';
import { useLightDarkMode } from '@app/context/LightDarkMode';

const Tooltip = ({
    children,
    content,
    position = 'top',
    delay = 200,
    maxWidth = '300px'
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const [arrowPosition, setArrowPosition] = useState({ left: '50%', top: '50%' });
    const timeoutRef = useRef(null);
    const triggerRef = useRef(null);
    const tooltipRef = useRef(null);
    const { theme } = useLightDarkMode();

    // Calculate and update tooltip position
    const updatePosition = () => {
        if (triggerRef.current && tooltipRef.current) {
            const triggerRect = triggerRef.current.getBoundingClientRect();
            const tooltipRect = tooltipRef.current.getBoundingClientRect();

            let top = 0;
            let left = 0;
            let arrowLeft = '50%';
            let arrowTop = '50%';

            // Calculate position based on prop (using fixed positioning relative to viewport)
            switch (position) {
                case 'top':
                    top = triggerRect.top - tooltipRect.height - 12;
                    left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
                    arrowLeft = '50%';
                    break;
                case 'bottom':
                    top = triggerRect.bottom + 12;
                    left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
                    arrowLeft = '50%';
                    break;
                case 'left':
                    top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2);
                    left = triggerRect.left - tooltipRect.width - 12;
                    arrowTop = '50%';
                    break;
                case 'right':
                    top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2);
                    left = triggerRect.right + 12;
                    arrowTop = '50%';
                    break;
                default:
                    top = triggerRect.top - tooltipRect.height - 12;
                    left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
                    arrowLeft = '50%';
            }

            // Keep tooltip within viewport
            const viewportWidth = window.innerWidth;
            const padding = 10;

            if (left < padding) {
                if (position === 'top' || position === 'bottom') {
                    // Calculate arrow position to still point to the trigger
                    const triggerCenter = triggerRect.left + (triggerRect.width / 2);
                    arrowLeft = `${triggerCenter - padding}px`;
                }
                left = padding;
            } else if (left + tooltipRect.width > viewportWidth - padding) {
                if (position === 'top' || position === 'bottom') {
                    // Calculate arrow position to still point to the trigger
                    const triggerCenter = triggerRect.left + (triggerRect.width / 2);
                    const newLeft = viewportWidth - tooltipRect.width - padding;
                    arrowLeft = `${triggerCenter - newLeft}px`;
                }
                left = viewportWidth - tooltipRect.width - padding;
            }

            setCoords({ top, left });
            setArrowPosition({ left: arrowLeft, top: arrowTop });
        }
    };

    // Show tooltip with delay
    const showTooltip = () => {
        timeoutRef.current = setTimeout(() => {
            setIsVisible(true);
        }, delay);
    };

    // Update position after tooltip becomes visible
    useEffect(() => {
        if (isVisible) {
            // Small delay to ensure tooltip is rendered
            const positionTimeout = setTimeout(() => {
                updatePosition();
            }, 0);

            return () => clearTimeout(positionTimeout);
        }
    }, [isVisible]);

    // Hide tooltip, mean you aint hovering over it
    const hideTooltip = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        setIsVisible(false);
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    if (!content) return children;

    return (
        <>
            <div
                ref={triggerRef}
                onMouseEnter={showTooltip}
                onMouseLeave={hideTooltip}
                onFocus={showTooltip}
                onBlur={hideTooltip}
                style={{ display: 'inline-block' }}
            >
                {children}
            </div>

            {/* Tooltip */}
            {isVisible && (
                <div
                    ref={tooltipRef}
                    style={{
                        position: 'fixed',
                        top: `${coords.top}px`,
                        left: `${coords.left}px`,
                        maxWidth: maxWidth,
                        zIndex: 9999,
                        pointerEvents: 'none',
                    }}
                    className={`tooltip-container ${theme === 'dark' ? 'tooltip-dark' : 'tooltip-light'}`}
                >
                    <div className="tooltip-content">
                        {content}
                    </div>

                    {/* Arrow */}
                    <div
                        className="tooltip-arrow"
                        style={{
                            ...(position === 'top' && {
                                bottom: '-6px',
                                left: arrowPosition.left,
                                transform: 'translateX(-50%) rotate(45deg)',
                            }),
                            ...(position === 'bottom' && {
                                top: '-6px',
                                left: arrowPosition.left,
                                transform: 'translateX(-50%) rotate(45deg)',
                            }),
                            ...(position === 'left' && {
                                right: '-6px',
                                top: arrowPosition.top,
                                transform: 'translateY(-50%) rotate(45deg)',
                            }),
                            ...(position === 'right' && {
                                left: '-6px',
                                top: arrowPosition.top,
                                transform: 'translateY(-50%) rotate(45deg)',
                            }),
                        }}
                    />
                </div>
            )}
        </>
    );
};

export default Tooltip;

