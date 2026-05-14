// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IProductRegistry {
    enum Status {
        REGISTERED,
        VERIFIED,
        IN_TRANSIT,
        DELIVERED,
        FLAGGED,
        RECALLED
    }

    function productExists(bytes32 serialID) external view returns (bool);

    function getCurrentOwner(bytes32 serialID) external view returns (address);

    function getStatus(bytes32 serialID) external view returns (Status);

    function markInTransit(bytes32 serialID) external;

    function completeTransfer(bytes32 serialID, address newOwner) external;

    function flagProductFromLedger(
        bytes32 serialID,
        uint8 riskLevel,
        bytes32 reason
    ) external;
}

interface ISupplyChainAccessControl {
    function getPrimaryRole(address account) external view returns (bytes32);

    function isValidRoute(
        bytes32 fromRole,
        bytes32 toRole
    ) external view returns (bool);

    function canInitiateTransfer(bytes32 role) external pure returns (bool);

    function canReceiveTransfer(bytes32 role) external pure returns (bool);
}

contract TransferLedger {
    struct PendingTransfer {
        bytes32 serialID;
        address sender;
        address receiver;
        bytes32 senderRole;
        bytes32 receiverRole;
        bytes32 fromLocationHash;
        bytes32 toLocationHash;
        uint256 requestedAt;
        bool exists;
    }

    struct TransferRecord {
        bytes32 serialID;
        address from;
        address to;
        bytes32 fromRole;
        bytes32 toRole;
        bytes32 fromLocationHash;
        bytes32 toLocationHash;
        uint256 requestedAt;
        uint256 confirmedAt;
    }

    struct LastScan {
        uint256 timestamp;
        bytes32 locationHash;
    }

    uint8 public constant RISK_HIGH = 3;

    bytes32 public constant REASON_DOUBLE_SCAN = keccak256("DOUBLE_SCAN");
    bytes32 public constant REASON_INVALID_ROUTE = keccak256("INVALID_ROUTE");

    uint256 public constant DOUBLE_SCAN_WINDOW = 30 minutes;

    IProductRegistry public productRegistry;
    ISupplyChainAccessControl public accessControl;

    mapping(bytes32 => PendingTransfer) public pendingTransfers;
    mapping(bytes32 => TransferRecord[]) private transferHistory;
    mapping(bytes32 => LastScan) public lastScans;

    event TransferRequested(
        bytes32 indexed serialID,
        address indexed sender,
        address indexed receiver,
        bytes32 fromLocationHash,
        bytes32 toLocationHash,
        uint256 requestedAt
    );

    event TransferConfirmed(
        bytes32 indexed serialID,
        address indexed sender,
        address indexed receiver,
        uint256 confirmedAt
    );

    event TransferRejected(
        bytes32 indexed serialID,
        address indexed sender,
        address indexed receiver,
        bytes32 reason
    );

    event DoubleScanDetected(
        bytes32 indexed serialID,
        bytes32 previousLocationHash,
        bytes32 newLocationHash,
        uint256 previousTimestamp,
        uint256 newTimestamp
    );

    constructor(address productRegistryAddress, address accessControlAddress) {
        require(productRegistryAddress != address(0), "Invalid registry");
        require(accessControlAddress != address(0), "Invalid access control");

        productRegistry = IProductRegistry(productRegistryAddress);
        accessControl = ISupplyChainAccessControl(accessControlAddress);
    }

    function createTransferRequest(
        bytes32 serialID,
        address receiver,
        bytes32 fromLocationHash,
        bytes32 toLocationHash
    ) external {
        require(serialID != bytes32(0), "Invalid serial");
        require(receiver != address(0), "Invalid receiver");
        require(receiver != msg.sender, "Receiver cannot be sender");
        require(fromLocationHash != bytes32(0), "Invalid from location");
        require(toLocationHash != bytes32(0), "Invalid to location");
        require(productRegistry.productExists(serialID), "Product not found");
        require(!pendingTransfers[serialID].exists, "Pending transfer exists");

        address currentOwner = productRegistry.getCurrentOwner(serialID);
        require(currentOwner == msg.sender, "Not current owner");

        IProductRegistry.Status status = productRegistry.getStatus(serialID);
        require(status != IProductRegistry.Status.RECALLED, "Product recalled");
        require(status != IProductRegistry.Status.FLAGGED, "Product flagged");
        require(status != IProductRegistry.Status.IN_TRANSIT, "Already in transit");

        bytes32 senderRole = accessControl.getPrimaryRole(msg.sender);
        bytes32 receiverRole = accessControl.getPrimaryRole(receiver);

        require(senderRole != bytes32(0), "Sender has no role");
        require(receiverRole != bytes32(0), "Receiver has no role");

        require(
            accessControl.canInitiateTransfer(senderRole),
            "Sender cannot initiate"
        );
        require(
            accessControl.canReceiveTransfer(receiverRole),
            "Receiver cannot receive"
        );

        bool routeAllowed = accessControl.isValidRoute(senderRole, receiverRole);

        if (!routeAllowed) {
            productRegistry.flagProductFromLedger(
                serialID,
                RISK_HIGH,
                REASON_INVALID_ROUTE
            );

            emit TransferRejected(
                serialID,
                msg.sender,
                receiver,
                REASON_INVALID_ROUTE
            );

            revert("Invalid route");
        }

        _checkDoubleScan(serialID, fromLocationHash);

        pendingTransfers[serialID] = PendingTransfer({
            serialID: serialID,
            sender: msg.sender,
            receiver: receiver,
            senderRole: senderRole,
            receiverRole: receiverRole,
            fromLocationHash: fromLocationHash,
            toLocationHash: toLocationHash,
            requestedAt: block.timestamp,
            exists: true
        });

        productRegistry.markInTransit(serialID);

        lastScans[serialID] = LastScan({
            timestamp: block.timestamp,
            locationHash: fromLocationHash
        });

        emit TransferRequested(
            serialID,
            msg.sender,
            receiver,
            fromLocationHash,
            toLocationHash,
            block.timestamp
        );
    }

    function confirmTransfer(
        bytes32 serialID,
        bytes32 receiverLocationHash
    ) external {
        require(serialID != bytes32(0), "Invalid serial");
        require(receiverLocationHash != bytes32(0), "Invalid receiver location");

        PendingTransfer memory pendingTransfer = pendingTransfers[serialID];

        require(pendingTransfer.exists, "No pending transfer");
        require(msg.sender == pendingTransfer.receiver, "Not receiver");

        IProductRegistry.Status status = productRegistry.getStatus(serialID);
        require(status != IProductRegistry.Status.RECALLED, "Product recalled");
        require(status != IProductRegistry.Status.FLAGGED, "Product flagged");
        require(status == IProductRegistry.Status.IN_TRANSIT, "Not in transit");

        require(
            receiverLocationHash == pendingTransfer.toLocationHash,
            "Location mismatch"
        );

        productRegistry.completeTransfer(serialID, msg.sender);

        transferHistory[serialID].push(
            TransferRecord({
                serialID: serialID,
                from: pendingTransfer.sender,
                to: pendingTransfer.receiver,
                fromRole: pendingTransfer.senderRole,
                toRole: pendingTransfer.receiverRole,
                fromLocationHash: pendingTransfer.fromLocationHash,
                toLocationHash: receiverLocationHash,
                requestedAt: pendingTransfer.requestedAt,
                confirmedAt: block.timestamp
            })
        );

        delete pendingTransfers[serialID];

        lastScans[serialID] = LastScan({
            timestamp: block.timestamp,
            locationHash: receiverLocationHash
        });

        emit TransferConfirmed(
            serialID,
            pendingTransfer.sender,
            pendingTransfer.receiver,
            block.timestamp
        );
    }

    function getTransferHistory(
        bytes32 serialID
    ) external view returns (TransferRecord[] memory) {
        return transferHistory[serialID];
    }

    function getTransferHistoryLength(
        bytes32 serialID
    ) external view returns (uint256) {
        return transferHistory[serialID].length;
    }

    function _checkDoubleScan(
        bytes32 serialID,
        bytes32 newLocationHash
    ) internal {
        LastScan memory previousScan = lastScans[serialID];

        if (
            previousScan.timestamp != 0 &&
            block.timestamp - previousScan.timestamp < DOUBLE_SCAN_WINDOW &&
            previousScan.locationHash != newLocationHash
        ) {
            productRegistry.flagProductFromLedger(
                serialID,
                RISK_HIGH,
                REASON_DOUBLE_SCAN
            );

            emit DoubleScanDetected(
                serialID,
                previousScan.locationHash,
                newLocationHash,
                previousScan.timestamp,
                block.timestamp
            );

            revert("Double scan detected");
        }
    }
}