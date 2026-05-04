'use client'
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  HomeIcon,
  BookOpenIcon,
  AcademicCapIcon,
  UserIcon,
  CalendarIcon,
  ChevronDownIcon,
  CogIcon
} from '@heroicons/react/24/outline';
import { useRole } from '@app/context/RoleContext';

const Nav = ({ onLinkClick, onLogout, can, pathname }) => {
  // Get isSuperadmin to check if user is Superadmin
  const { isSuperadmin } = useRole();
  // State to track open/close status of each dropdown
  const [openDropdowns, setOpenDropdowns] = useState({});

  const LINKS = [
    {
      name: "Dashboard",
      link: "/view/dashboard",
      icon: HomeIcon
    },
    {
      name: "Units",
      link: "#",
      icon: BookOpenIcon,
      sub_links: [
        {
          name: "Unit Management",
          link: "/view/unit",
        },
        {
          name: "Unit Types Management",
          link: "/view/unit_type",
        },
      ],
    },
    {
      name: "Courses",
      link: "/view/course",
      icon: AcademicCapIcon
    },
    {
      name: "Students",
      link: "#",
      icon: UserIcon,
      sub_links: [
        {
          name: "Student Information",
          link: "/view/student_information",
        },
        {
          name: "Search By Student ID",
          link: "/view/search_student_study_planner",
        },
      ],
    },
    {
      name: "Term",
      link: "/view/terms/",
      icon: CalendarIcon
    },
    {
      name: "Administration",
      link: "#",
      icon: CogIcon,
      sub_links: [
        {
          name: "Role Management",
          link: "/view/roles",
        },
        {
          name: "User Management (Whitelist)",
          link: "/view/user_management",
        },
        {
          name: "Audit Logs",
          link: "/view/audit_logs",
        }
      ],
    }
  ];

  // Permission mapping for navigation items
  const getPermissionForLink = (link) => {
    const permissionMap = {
      '/view/dashboard': null, // Dashboard is always accessible
      '/view/unit': 'unit:read',
      '/view/unit_type': 'unit_type:read',
      '/view/course': 'course:read',
      '/view/search_student_study_planner': 'search_students:read',
      '/view/student_information': 'student_info:read',
      '/view/terms/': 'term:read',
      '/view/roles': 'role:read',
      '/view/users': 'user:read',
      '/view/user_management': 'user:read', // Requires user:read to access the page
      '/view/audit_logs': 'audit_logs:read' // Requires audit_logs:read (Superadmin only)
    };
    return permissionMap[link] || null;
  };

  // Filter links based on permissions
  const filterLinksByPermissions = (links) => {
    return links.filter(link => {
      // Check dashboard access - if no dashboard access and on dashboard page, hide all navigation
      if (link.link === '/view/dashboard') {
        return can('dashboard', 'access');
      }

      // Check main link permission
      const mainPermission = getPermissionForLink(link.link);
      if (mainPermission && !can(mainPermission.split(':')[0], mainPermission.split(':')[1])) {
        return false;
      }

      // If has sub_links, filter them and only show parent if at least one sub_link is accessible
      if (link.sub_links) {
        const accessibleSubLinks = link.sub_links.filter(subLink => {
          // Special case: Audit Logs only for Superadmin
          if (subLink.link === '/view/audit_logs') {
            return isSuperadmin();
          }
          const subPermission = getPermissionForLink(subLink.link);
          return !subPermission || can(subPermission.split(':')[0], subPermission.split(':')[1]);
        });

        // Only show parent if it has accessible sub_links
        return accessibleSubLinks.length > 0;
      }

      return true;
    }).map(link => {
      // Create a copy of the link to avoid mutating the original
      if (link.sub_links) {
        const accessibleSubLinks = link.sub_links.filter(subLink => {
          // Special case: Audit Logs only for Superadmin
          if (subLink.link === '/view/audit_logs') {
            return isSuperadmin();
          }
          const subPermission = getPermissionForLink(subLink.link);
          return !subPermission || can(subPermission.split(':')[0], subPermission.split(':')[1]);
        });

        return {
          ...link,
          sub_links: accessibleSubLinks
        };
      }
      return link;
    });
  };

  // Get filtered links
  const filteredLinks = filterLinksByPermissions(LINKS);

  // Toggle the dropdown visibility for each item
  const toggleDropdown = (index) => {
    setOpenDropdowns((prevState) => {
      const isOpen = prevState[index];
      // If the clicked dropdown is already open, close it. Otherwise, open only this one.
      return isOpen ? {} : { [index]: true };
    });
  };

  return (
    <nav className="flex flex-col h-full">
      <ul className="list-none p-4 space-y-2 h-[90%] overflow-y-auto">
        {filteredLinks.map((item, index) => (
          <div key={index} className="mb-3">
            <li>
              {item.sub_links ? (
                <button
                  onClick={() => toggleDropdown(index)}
                  className="flex items-center w-full text-white transition-colors duration-200 focus:outline-none font-medium hover:text-[#DC2D27] p-3 rounded-lg hover:bg-gray-700/50"
                >
                  {item.icon && <item.icon className="h-6 w-6 mr-4" />}
                  <span className="text-base">{item.name}</span>
                  <ChevronDownIcon
                    className={`ml-auto h-5 w-5 transition-transform duration-200 ${openDropdowns[index] ? 'rotate-180' : ''
                      }`}
                  />
                </button>
              ) : (
                <Link
                  href={item.link}
                  onClick={onLinkClick}
                  className="flex items-center text-white transition-colors duration-200 font-medium hover:text-[#DC2D27] p-3 rounded-lg hover:bg-gray-700/50"
                >
                  {item.icon && <item.icon className="h-6 w-6 mr-4" />}
                  <span className="text-base">{item.name}</span>
                </Link>
              )}
            </li>

            {item.sub_links && openDropdowns[index] && (
              <ul className="mt-2 ml-8 space-y-1 border-l-2 border-gray-700">
                {item.sub_links.map((subItem, subIndex) => (
                  <li key={subIndex}>
                    <Link
                      href={subItem.link}
                      onClick={onLinkClick}
                      className="flex items-center text-white transition-colors duration-200 hover:text-[#DC2D27] p-2 pl-4 rounded-lg hover:bg-gray-700/50"
                    >
                      <span className="text-sm">{subItem.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </ul>
      {/* Logout at bottom */}
      <div className="p-4">
        <button
          onClick={typeof onLogout === 'function' ? onLogout : undefined}
          className="text-[#dc2d27] text-xl font-medium bg-transparent cursor-pointer outline-none"
          style={{ boxShadow: 'none', background: 'none' }}
        >
          Logout
        </button>
      </div>
    </nav>
  );
};

export default Nav;