// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract SupplyChainAccessControl is AccessControl {
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant IMPORTER_ROLE = keccak256("IMPORTER_ROLE");
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant CLINIC_ROLE = keccak256("CLINIC_ROLE");
    bytes32 public constant PHARMACY_ROLE = keccak256("PHARMACY_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant RECALL_AUTHORITY_ROLE = keccak256("RECALL_AUTHORITY_ROLE");

    mapping(bytes32 => mapping(bytes32 => bool)) private routeMatrix;
    mapping(address => bytes32) private primaryRoles;

    event UserRoleGranted(address indexed account, bytes32 indexed role);
    event UserRoleRevoked(address indexed account, bytes32 indexed role);
    event PrimaryRoleSet(address indexed account, bytes32 indexed role);
    event RouteUpdated(bytes32 indexed fromRole, bytes32 indexed toRole, bool allowed);

    constructor(address admin) {
        require(admin != address(0), "Invalid admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function grantUserRole(address account, bytes32 role)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(account != address(0), "Invalid account");
        require(role != bytes32(0), "Invalid role");

        grantRole(role, account);

        if (primaryRoles[account] == bytes32(0)) {
            primaryRoles[account] = role;
            emit PrimaryRoleSet(account, role);
        }

        emit UserRoleGranted(account, role);
    }

    function revokeUserRole(address account, bytes32 role)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(account != address(0), "Invalid account");
        require(role != bytes32(0), "Invalid role");

        revokeRole(role, account);

        if (primaryRoles[account] == role) {
            primaryRoles[account] = bytes32(0);
            emit PrimaryRoleSet(account, bytes32(0));
        }

        emit UserRoleRevoked(account, role);
    }

    function setPrimaryRole(address account, bytes32 role)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(account != address(0), "Invalid account");
        require(hasRole(role, account), "Account does not have role");

        primaryRoles[account] = role;
        emit PrimaryRoleSet(account, role);
    }

    function getPrimaryRole(address account) external view returns (bytes32) {
        return primaryRoles[account];
    }

    function setRoute(bytes32 fromRole, bytes32 toRole, bool allowed)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(fromRole != bytes32(0), "Invalid from role");
        require(toRole != bytes32(0), "Invalid to role");

        routeMatrix[fromRole][toRole] = allowed;
        emit RouteUpdated(fromRole, toRole, allowed);
    }

    function isValidRoute(bytes32 fromRole, bytes32 toRole)
        external
        view
        returns (bool)
    {
        return routeMatrix[fromRole][toRole];
    }
}