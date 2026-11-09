// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract LabHandover {
    struct HandoverProof {
        uint256 submissionId;
        bytes32 studentIdHash;
        address laboranWallet;
        string status;
        uint256 timestamp;
        uint256 nonce;
        bytes32 itemsHash;
        bool confirmed;
    }

    mapping(uint256 => HandoverProof) private handoverProofs;
    mapping(uint256 => bool) public usedNonces;
    mapping(address => bool) public authorizedLaboran;

    address public owner;

    event HandoverConfirmed(
        uint256 indexed submissionId,
        bytes32 studentIdHash,
        address laboranWallet,
        uint256 timestamp,
        uint256 nonce
    );

    event LaboranAuthorized(address indexed laboran, uint256 timestamp);
    event LaboranRevoked(address indexed laboran, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function confirmHandoverWithSig(
        uint256 submissionId,
        bytes32 studentIdHash,
        bytes32 itemsHash,
        string calldata status,
        uint256 timestamp,
        uint256 nonce,
        bytes calldata signature
    ) external returns (bool) {
        require(timestamp <= block.timestamp + 300, "Timestamp too far in future");
        require(timestamp + 300 >= block.timestamp, "Timestamp expired");
        require(!usedNonces[nonce], "Nonce already used");
        require(keccak256(bytes(status)) == keccak256(bytes("COMPLETED")), "Invalid status");

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Handover(uint256 submissionId,bytes32 studentIdHash,bytes32 itemsHash,string status,uint256 timestamp,uint256 nonce)"),
                submissionId,
                studentIdHash,
                itemsHash,
                keccak256(bytes(status)),
                timestamp,
                nonce
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _domainSeparatorV4(),
                structHash
            )
        );

        address signer = _recoverSigner(digest, signature);
        require(authorizedLaboran[signer], "Laboran not authorized");

        usedNonces[nonce] = true;

        handoverProofs[submissionId] = HandoverProof({
            submissionId: submissionId,
            studentIdHash: studentIdHash,
            laboranWallet: signer,
            status: status,
            timestamp: timestamp,
            nonce: nonce,
            itemsHash: itemsHash,
            confirmed: true
        });

        emit HandoverConfirmed(submissionId, studentIdHash, signer, timestamp, nonce);
        return true;
    }

    function authorizeLaboran(address laboran) external onlyOwner {
        authorizedLaboran[laboran] = true;
        emit LaboranAuthorized(laboran, block.timestamp);
    }

    function revokeLaboran(address laboran) external onlyOwner {
        authorizedLaboran[laboran] = false;
        emit LaboranRevoked(laboran, block.timestamp);
    }

    function getHandoverProof(uint256 submissionId) external view returns (HandoverProof memory proof) {
        return handoverProofs[submissionId];
    }

    function isHandoverConfirmed(uint256 submissionId) external view returns (bool) {
        return handoverProofs[submissionId].confirmed;
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) {
            v += 27;
        }
        return ecrecover(digest, v, r, s);
    }

    function _domainSeparatorV4() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("LabHandover")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }
}
