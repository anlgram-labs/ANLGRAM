tolk 1.2;

// Formal Tolk Error Specification for ANLGRAM VNext / Generation-2 Suite
// Reference-only schema: existing FunC financial bytecode is preserved verbatim.
// Consulted TON Docs: https://docs.ton.org/llms/tvm/exit-codes/content.md

const ERR_INVALID_OP: int = 0xFFFF;
const ERR_WRONG_WORKCHAIN: int = 333;

// Jetton Minter & Wallet (TEP-74)
const ERR_MINTER_UNAUTHORIZED_MINT: int = 73;
const ERR_MINTER_NOT_DISCOVERY_FEE: int = 75;
const ERR_WALLET_UNAUTHORIZED_TRANSFER: int = 705;
const ERR_WALLET_INSUFFICIENT_BALANCE: int = 706;
const ERR_WALLET_UNAUTHORIZED_INCOMING: int = 707;
const ERR_WALLET_MALFORMED_FORWARD_PAYLOAD: int = 708;
const ERR_WALLET_INSUFFICIENT_FORWARD_TON: int = 709;

// ANLGRAM Bonding Curve VNext / Dispatch V2
const ERR_CURVE_UNAUTHORIZED: int = 401;
const ERR_CURVE_NOT_ACTIVE: int = 402;
const ERR_CURVE_ZERO_INPUT: int = 403;
const ERR_CURVE_SLIPPAGE_EXCEEDED: int = 404;
const ERR_CURVE_INSUFFICIENT_GAS: int = 405;
const ERR_CURVE_NO_PENDING_REFUND: int = 406;
const ERR_CURVE_MIGRATION_GAS_LOW: int = 407;
const ERR_CURVE_INVALID_ADDRESS_OR_NETWORK: int = 408;
const ERR_CURVE_INVALID_STATE: int = 409;
const ERR_CURVE_TOTAL_SUPPLY_MISMATCH: int = 410;
const ERR_CURVE_INVALID_RENOUNCE: int = 411;
const ERR_CURVE_INVALID_RENOUNCE_QUERY: int = 412;
const ERR_CURVE_SUPPLY_MISMATCH_RENOUNCE: int = 413;
const ERR_GATE_414_CLOSED: int = 414;
const ERR_CURVE_NO_FEES_TO_SWEEP: int = 415;
const ERR_CURVE_LP_AUTH_REQUIRED: int = 416;

// ANLGRAM LP Locker V2
const ERR_LOCKER_UNAUTHORIZED: int = 401;
const ERR_LOCKER_STILL_LOCKED: int = 403;
const ERR_LOCKER_UNKNOWN_OP: int = 404;
const ERR_LOCKER_INSUFFICIENT_GAS: int = 407;
const ERR_LOCKER_INVALID_CONFIG_OR_AMOUNT: int = 408;
const ERR_LOCKER_REPLAY_OR_STATE_MISMATCH: int = 409;

