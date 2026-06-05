// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * @file   ConfidentialPaymentGate.sol
 * @description Entry-point contract for ConfidentialFlow payment rails.
 *
 *   Users deposit encrypted cUSDT into the gate then call routePayment()
 *   to send funds to a recipient via one of three modes:
 *
 *     Mode 0 — Direct transfer  (liquid, instant)
 *     Mode 1 — Yield vault      (24-hour lock + 1% yield)
 *     Mode 2 — Vesting schedule (configurable cliff + linear duration)
 *
 *   Authorized external protocols may call routeFromProtocol() to route
 *   through the same dispatch logic without going through the deposit flow.
 *
 *   Sanction enforcement:
 *     Sanctioned senders are silently routed with 0 amount using
 *     FHE.select() rather than reverting, so transaction-level observers
 *     cannot infer sanction status from revert/success patterns.
 *
 *   ACL rules (every stored euint64):
 *     - FHE.allowThis() after every write.
 *     - FHE.allow(handle, user) when a user needs off-chain decryption.
 *     - FHE.allowTransient(handle, target) before any cross-contract call.
 */

import { FHE, euint64, externalEuint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { IERC7984Minimal } from "./interfaces/IERC7984Minimal.sol";
import { FlowRegistry } from "./FlowRegistry.sol";

interface IConfidentialYieldVault {
    function deposit(address user, euint64 amount) external;
}

interface IConfidentialVestingModule {
    function createVest(
        address beneficiary,
        euint64 totalAmount,
        uint256 cliffTimestamp,
        uint256 vestingDuration
    ) external;
}

/*
 * @title ConfidentialPaymentGate
 * @notice Custodial gateway: users deposit cUSDT, then route payments confidentially.
 *         External protocols registered by the admin may also route via routeFromProtocol().
 */
contract ConfidentialPaymentGate is ZamaEthereumConfig {

    /* ------------------------------------------------------------------
     * Constants
     * ------------------------------------------------------------------ */

    uint8 public constant MODE_LIQUID  = 0;
    uint8 public constant MODE_YIELD   = 1;
    uint8 public constant MODE_VESTING = 2;

    /*
     * Default vesting parameters used when mode is MODE_VESTING:
     * 30-day cliff, 180-day linear vest.
     */
    uint256 public constant DEFAULT_CLIFF_OFFSET  = 30 days;
    uint256 public constant DEFAULT_VEST_DURATION = 180 days;

    /* ------------------------------------------------------------------
     * State
     * ------------------------------------------------------------------ */

    address public admin;
    address public immutable cUSDT;

    IConfidentialYieldVault    public yieldVault;
    IConfidentialVestingModule public vestingModule;
    FlowRegistry               public flowRegistry;

    /* ---- Sanction / balance tracking ---- */
    mapping(address => bool)    public sanctioned;
    mapping(address => euint64) private _balances;
    mapping(address => bool)    private _hasBalance;

    /* ---- Protocol Registry ---- */
    mapping(address => bool)   public authorizedProtocols;
    mapping(address => string) public protocolNames;
    address[]                  private _protocolList;

    /* ------------------------------------------------------------------
     * Events
     * ------------------------------------------------------------------ */

    /* Amount intentionally omitted to preserve confidentiality. */
    event Deposited(address indexed user, uint256 timestamp);

    /* Amount intentionally omitted to preserve confidentiality. */
    event PaymentRouted(
        address indexed from,
        address indexed to,
        uint8   mode,
        uint256 timestamp
    );

    event SanctionUpdated(address indexed user, bool status);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);
    event ProtocolRegistered(address indexed protocol, string name);
    event ProtocolRevoked(address indexed protocol);

    /* ------------------------------------------------------------------
     * Modifiers
     * ------------------------------------------------------------------ */

    modifier onlyAdmin() {
        require(msg.sender == admin, "ConfidentialPaymentGate: caller is not admin");
        _;
    }

    modifier onlyAuthorizedProtocol() {
        require(
            authorizedProtocols[msg.sender],
            "ConfidentialPaymentGate: caller is not an authorized protocol"
        );
        _;
    }

    /* ------------------------------------------------------------------
     * Constructor
     * ------------------------------------------------------------------ */

    /*
     * @param _cUSDT         Address of the ERC-7984 cUSDT token.
     * @param _flowRegistry  Address of the FlowRegistry contract.
     */
    constructor(address _cUSDT, address _flowRegistry) {
        require(_cUSDT        != address(0), "ConfidentialPaymentGate: zero cUSDT address");
        require(_flowRegistry != address(0), "ConfidentialPaymentGate: zero registry address");
        admin        = msg.sender;
        cUSDT        = _cUSDT;
        flowRegistry = FlowRegistry(_flowRegistry);
    }

    /* ------------------------------------------------------------------
     * Admin — module wiring
     * ------------------------------------------------------------------ */

    /*
     * @notice Wire up vault and vesting module addresses after deployment.
     *         Can only be called once (modules are immutable after first set).
     */
    function setModules(
        address _yieldVault,
        address _vestingModule
    ) external onlyAdmin {
        require(_yieldVault    != address(0), "ConfidentialPaymentGate: zero vault address");
        require(_vestingModule != address(0), "ConfidentialPaymentGate: zero vesting address");
        require(
            address(yieldVault) == address(0),
            "ConfidentialPaymentGate: modules already set"
        );
        yieldVault    = IConfidentialYieldVault(_yieldVault);
        vestingModule = IConfidentialVestingModule(_vestingModule);
    }

    /* ------------------------------------------------------------------
     * Admin — sanction controls
     * ------------------------------------------------------------------ */

    /*
     * @notice Mark or clear the sanction flag for an address.
     *         Sanctioned senders may still call routePayment but will route 0.
     */
    function setSanctioned(address user, bool status) external onlyAdmin {
        sanctioned[user] = status;
        emit SanctionUpdated(user, status);
    }

    /*
     * @notice Transfer the admin role to a new address.
     */
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "ConfidentialPaymentGate: zero admin address");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    /* ------------------------------------------------------------------
     * Admin — protocol registry
     * ------------------------------------------------------------------ */

    /*
     * @notice Authorize an external protocol contract to call routeFromProtocol().
     * @param protocol  Address of the protocol contract.
     * @param name      Human-readable name stored for off-chain indexers.
     */
    function registerProtocol(
        address        protocol,
        string calldata name
    ) external onlyAdmin {
        require(protocol != address(0),    "ConfidentialPaymentGate: zero protocol address");
        require(bytes(name).length > 0,    "ConfidentialPaymentGate: empty protocol name");
        require(
            !authorizedProtocols[protocol],
            "ConfidentialPaymentGate: protocol already registered"
        );
        authorizedProtocols[protocol] = true;
        protocolNames[protocol]       = name;
        _protocolList.push(protocol);
        emit ProtocolRegistered(protocol, name);
    }

    /*
     * @notice Remove authorization from a previously registered protocol.
     * @param protocol  Address of the protocol contract to revoke.
     */
    function revokeProtocol(address protocol) external onlyAdmin {
        require(
            authorizedProtocols[protocol],
            "ConfidentialPaymentGate: protocol not registered"
        );
        authorizedProtocols[protocol] = false;

        /* Remove from list by swap-and-pop to keep gas bounded. */
        uint256 len = _protocolList.length;
        for (uint256 i = 0; i < len; ) {
            if (_protocolList[i] == protocol) {
                _protocolList[i] = _protocolList[len - 1];
                _protocolList.pop();
                break;
            }
            unchecked { ++i; }
        }
        emit ProtocolRevoked(protocol);
    }

    /*
     * @notice Returns all currently authorized protocol addresses and their names.
     *         Revoked protocols are excluded from the list.
     */
    function getRegisteredProtocols()
        external
        view
        returns (address[] memory protocols, string[] memory names)
    {
        uint256 len = _protocolList.length;
        protocols = new address[](len);
        names     = new string[](len);
        for (uint256 i = 0; i < len; ) {
            protocols[i] = _protocolList[i];
            names[i]     = protocolNames[_protocolList[i]];
            unchecked { ++i; }
        }
    }

    /* ------------------------------------------------------------------
     * Core — deposit
     * ------------------------------------------------------------------ */

    /*
     * @notice Deposit encrypted cUSDT into the gate.
     *         Caller must have previously approved the gate as a cUSDT operator:
     *           cUSDT.setOperator(address(gate), expiryTimestamp)
     * @param encryptedAmount  ABI-encoded encrypted amount from the FHEVM SDK.
     * @param inputProof       ZK proof for the encrypted amount.
     */
    function deposit(
        externalEuint64 encryptedAmount,
        bytes calldata  inputProof
    ) external {
        /* Decrypt and verify the user-supplied input; gate gets transient ACL. */
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        /* Pull cUSDT from the caller into the gate via the operator approval. */
        FHE.allowTransient(amount, cUSDT);
        IERC7984Minimal(cUSDT).confidentialTransferFrom(msg.sender, address(this), amount);

        /* Update gate-internal balance. */
        if (_hasBalance[msg.sender]) {
            euint64 newBal = FHE.add(_balances[msg.sender], amount);
            FHE.allowThis(newBal);
            FHE.allow(newBal, msg.sender);
            _balances[msg.sender] = newBal;
        } else {
            FHE.allowThis(amount);
            FHE.allow(amount, msg.sender);
            _balances[msg.sender] = amount;
            _hasBalance[msg.sender] = true;
        }

        emit Deposited(msg.sender, block.timestamp);
    }

    /* ------------------------------------------------------------------
     * Core — user-initiated route
     * ------------------------------------------------------------------ */

    /*
     * @notice Route an encrypted payment from the caller's gate balance to a recipient.
     *
     *         Sanction gate: if msg.sender is sanctioned, the effective amount is
     *         silently zeroed via FHE.select (no revert, no information leak).
     *
     *         Insufficient-balance gate: if the requested amount exceeds the gate
     *         balance the effective amount is also silently zeroed.
     *
     * @param recipient        Destination address.
     * @param encryptedAmount  ABI-encoded encrypted amount.
     * @param inputProof       ZK proof for the encrypted amount.
     * @param mode             Routing mode: 0=liquid, 1=yield, 2=vesting.
     */
    function routePayment(
        address         recipient,
        externalEuint64 encryptedAmount,
        bytes calldata  inputProof,
        uint8           mode
    ) external {
        require(recipient != address(0), "ConfidentialPaymentGate: zero recipient");
        require(mode <= MODE_VESTING,    "ConfidentialPaymentGate: invalid mode");
        require(_hasBalance[msg.sender], "ConfidentialPaymentGate: no deposit");

        /* Step 1: Decrypt user-supplied amount; gate receives transient ACL. */
        euint64 requestedAmt = FHE.fromExternal(encryptedAmount, inputProof);

        /* Step 2: Sanction filter (FHE.select — no revert). */
        ebool   notSanctioned = FHE.asEbool(!sanctioned[msg.sender]);
        euint64 sanitizedAmt  = FHE.select(notSanctioned, requestedAmt, FHE.asEuint64(0));

        /* Step 3: Balance-sufficiency gate. */
        ebool   hasEnough   = FHE.le(sanitizedAmt, _balances[msg.sender]);
        euint64 sendAmt     = FHE.select(hasEnough, sanitizedAmt, FHE.asEuint64(0));
        euint64 newBalance  = FHE.select(
            hasEnough,
            FHE.sub(_balances[msg.sender], sanitizedAmt),
            _balances[msg.sender]
        );

        /* Step 4: Persist updated sender balance. */
        FHE.allowThis(newBalance);
        FHE.allow(newBalance, msg.sender);
        _balances[msg.sender] = newBalance;

        /* Step 5: Dispatch via shared routing logic. */
        _executeRoute(msg.sender, recipient, sendAmt, mode);
    }

    /* ------------------------------------------------------------------
     * Core — protocol-initiated route
     * ------------------------------------------------------------------ */

    /*
     * @notice Route a payment on behalf of an address using a pre-encrypted handle
     *         supplied by an authorized protocol.
     *
     *         The calling protocol MUST grant this contract transient ACL on the
     *         handle before calling, otherwise all FHE operations will revert:
     *           FHE.allowTransient(encryptedAmount, address(gate));
     *
     *         This function does NOT check caller balances — the protocol is
     *         responsible for ensuring sufficient funds are available.
     *
     * @param from             Logical sender address (recorded in PaymentRouted event).
     * @param to               Recipient address.
     * @param encryptedAmount  Pre-encrypted euint64 handle; gate must hold transient ACL.
     * @param routingMode      Routing mode: 0=liquid, 1=yield, 2=vesting.
     */
    function routeFromProtocol(
        address from,
        address to,
        euint64 encryptedAmount,
        uint8   routingMode
    ) external onlyAuthorizedProtocol {
        require(from != address(0),          "ConfidentialPaymentGate: zero from address");
        require(to   != address(0),          "ConfidentialPaymentGate: zero to address");
        require(routingMode <= MODE_VESTING, "ConfidentialPaymentGate: invalid mode");
        _executeRoute(from, to, encryptedAmount, routingMode);
    }

    /* ------------------------------------------------------------------
     * Internal — shared dispatch
     * ------------------------------------------------------------------ */

    /*
     * @dev Shared dispatch logic used by both routePayment and routeFromProtocol.
     *      Caller must ensure the gate holds ACL on sendAmt before calling.
     */
    function _executeRoute(
        address from,
        address to,
        euint64 sendAmt,
        uint8   mode
    ) internal {
        if (mode == MODE_YIELD) {
            require(
                address(yieldVault) != address(0),
                "ConfidentialPaymentGate: vault not set"
            );
            FHE.allowTransient(sendAmt, cUSDT);
            IERC7984Minimal(cUSDT).confidentialTransfer(address(yieldVault), sendAmt);
            FHE.allowTransient(sendAmt, address(yieldVault));
            yieldVault.deposit(to, sendAmt);

        } else if (mode == MODE_VESTING) {
            require(
                address(vestingModule) != address(0),
                "ConfidentialPaymentGate: vesting not set"
            );
            uint256 cliffTs      = block.timestamp + DEFAULT_CLIFF_OFFSET;
            uint256 vestDuration = DEFAULT_VEST_DURATION;
            FHE.allowTransient(sendAmt, cUSDT);
            IERC7984Minimal(cUSDT).confidentialTransfer(address(vestingModule), sendAmt);
            FHE.allowTransient(sendAmt, address(vestingModule));
            vestingModule.createVest(to, sendAmt, cliffTs, vestDuration);

        } else {
            /* MODE_LIQUID: direct confidential transfer to recipient. */
            FHE.allowTransient(sendAmt, cUSDT);
            IERC7984Minimal(cUSDT).confidentialTransfer(to, sendAmt);
        }

        /* Allow recipient to decrypt the sent amount for their own records. */
        FHE.allow(sendAmt, to);

        emit PaymentRouted(from, to, mode, block.timestamp);
    }

    /* ------------------------------------------------------------------
     * View functions
     * ------------------------------------------------------------------ */

    /*
     * @notice Returns the encrypted gate-balance handle for `user`.
     *         Caller must hold ACL on the returned handle to decrypt it.
     */
    function getBalance(address user) external view returns (euint64) {
        return _balances[user];
    }

    /*
     * @notice Returns true when `user` has a gate-balance entry (may be zero internally).
     */
    function hasBalance(address user) external view returns (bool) {
        return _hasBalance[user];
    }
}
