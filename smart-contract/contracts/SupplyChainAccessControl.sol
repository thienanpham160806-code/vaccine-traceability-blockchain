// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract SupplyChainAccessControl is AccessControl {
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant IMPORTER_ROLE = keccak256("IMPORTER_ROLE");
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant CLINIC_ROLE = keccak256("CLINIC_ROLE");
    bytes32 public constant PHARMACY_ROLE = keccak256("PHARMACY_ROLE");
    bytes32 public constant RECALL_AUTHORITY_ROLE = keccak256("RECALL_AUTHORITY_ROLE");

    mapping(bytes32 => mapping(bytes32 => bool)) private routeMatrix;
    mapping(address => bytes32) private primaryRoles;

    event UserRoleGranted(address indexed account, bytes32 indexed role);
    event UserRoleRevoked(address indexed account, bytes32 indexed role);
    event PrimaryRoleSet(address indexed account, bytes32 indexed role);
    event RouteUpdated(bytes32 indexed fromRole, bytes32 indexed toRole, bool allowed);
    event MvpRoutesConfigured();

    constructor(address admin) {
        require(admin != address(0), "Invalid admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function isSupportedRole(bytes32 role) public pure returns (bool) {
        return role == MANUFACTURER_ROLE ||
            role == IMPORTER_ROLE ||
            role == DISTRIBUTOR_ROLE ||
            role == CLINIC_ROLE ||
            role == PHARMACY_ROLE ||
            role == RECALL_AUTHORITY_ROLE;
    }

    function canInitiateTransfer(bytes32 role) public pure returns (bool) {
        return role == MANUFACTURER_ROLE ||
            role == IMPORTER_ROLE ||
            role == DISTRIBUTOR_ROLE;
    }

    function canReceiveTransfer(bytes32 role) public pure returns (bool) {
        return role == IMPORTER_ROLE ||
            role == DISTRIBUTOR_ROLE ||
            role == CLINIC_ROLE ||
            role == PHARMACY_ROLE;
    }

    function grantUserRole(address account, bytes32 role)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(account != address(0), "Invalid account");
        require(isSupportedRole(role), "Unsupported role");

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
        require(isSupportedRole(role), "Unsupported role");

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
        require(isSupportedRole(role), "Unsupported role");
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
        require(canInitiateTransfer(fromRole), "Unsupported sender role");
        require(canReceiveTransfer(toRole), "Unsupported receiver role");

        _setRoute(fromRole, toRole, allowed);
    }

    function configureMvpRoutes() external onlyRole(DEFAULT_ADMIN_ROLE) {
        // Domestic manufacturers send directly to distributors. Importers
        // originate imported-product flows and also send to distributors.
        _setRoute(MANUFACTURER_ROLE, IMPORTER_ROLE, false);
        _setRoute(MANUFACTURER_ROLE, DISTRIBUTOR_ROLE, true);
        _setRoute(IMPORTER_ROLE, DISTRIBUTOR_ROLE, true);
        _setRoute(DISTRIBUTOR_ROLE, DISTRIBUTOR_ROLE, false);
        _setRoute(DISTRIBUTOR_ROLE, CLINIC_ROLE, true);
        _setRoute(DISTRIBUTOR_ROLE, PHARMACY_ROLE, true);

        emit MvpRoutesConfigured();
    }

    function isValidRoute(bytes32 fromRole, bytes32 toRole)
        external
        view
        returns (bool)
    {
        return routeMatrix[fromRole][toRole];
    }

    function _setRoute(bytes32 fromRole, bytes32 toRole, bool allowed) internal {
        routeMatrix[fromRole][toRole] = allowed;
        emit RouteUpdated(fromRole, toRole, allowed);
    }
}
