tolk 1.2;

import "errors"

// Formal Tolk Message & TL-B Schema Specification for ANLGRAM VNext / Generation-2
// Reference-only schema: existing FunC financial bytecode is preserved verbatim.
// Consulted TON Docs:
// - https://docs.ton.org/llms/contracts/standard/tokens/jettons/api/content.md
// - https://docs.ton.org/llms/contracts/techniques/on-chain-jetton-processing/content.md
// - https://docs.ton.org/llms/foundations/messages/modes/content.md

// ============================================================================
// 1. Standard TEP-74 Jetton Messages
// ============================================================================

struct (0x0f8a7ea5) JettonTransfer {
    queryId: uint64
    amount: coins
    destination: address
    responseDestination: address?
    customPayload: cell?
    forwardTonAmount: coins
    forwardPayload: RemainingBitsAndRefs
}

struct (0x178d4519) JettonInternalTransfer {
    queryId: uint64
    amount: coins
    fromAddress: address?
    responseAddress: address?
    forwardTonAmount: coins
    forwardPayload: RemainingBitsAndRefs
}

struct (0x7362d09c) JettonTransferNotification {
    queryId: uint64
    amount: coins
    sender: address
    forwardPayload: RemainingBitsAndRefs
}

struct (0xd53276db) JettonExcesses {
    queryId: uint64
}

struct (0x595f07bc) JettonBurn {
    queryId: uint64
    amount: coins
    responseDestination: address?
    customPayload: cell?
}

struct (0x7bdd97de) JettonBurnNotification {
    queryId: uint64
    amount: coins
    sender: address
    responseDestination: address?
}

// ============================================================================
// 2. ANLGRAM Jetton Minter V5 Lifecycle Messages (PR #47 Genesis Sequence)
// ============================================================================

struct (0x00000015) MinterMintToCurve {
    queryId: uint64
    toAddress: address
    tonAmount: coins
    masterMsg: Cell<JettonInternalTransfer>
}

struct (0x00000003) MinterChangeAdminAndNotify {
    queryId: uint64
    newAdminAddress: address?
    notifyTargetAddress: address?
}

struct (0x414e4c32) AdminChangedNotification {
    queryId: uint64
    reportedAdmin: address?
    reportedSupply: coins
}

type AllowedMinterMessage =
    | MinterMintToCurve
    | MinterChangeAdminAndNotify
    | JettonBurnNotification

// ============================================================================
// 3. ANLGRAM Bonding Curve Dispatch V2 Messages (PR #46 & PR #47)
// ============================================================================

struct CurveInitEndpoints {
    dexRouterAddress: address
    lpLockerAddress: address
    migrationRouterAddress: address
}

struct (0x414e4c31) InitLaunchpad {
    queryId: uint64
    jettonMasterAddress: address
    curveJettonWallet: address?
    endpoints: Cell<CurveInitEndpoints>
    jettonWalletCode: cell
    migrationStateInit: cell
    guardStateInit: cell
}

struct (0x5fcc3d14) CurveBuy {
    queryId: uint64
    minTokensOut: coins
}

struct (0x414e4c34) CurveClaimRefund {
    queryId: uint64
}

struct (0x414e4c35) CurveCheckRenounce {
    queryId: uint64
}

struct (0x414e5803) CurveOneShotMigrationDispatch {
    queryId: uint64
    permitNonce: uint64
    permitDigest: bits256
}

struct (0x414e4c36) DepositTonLiquidity {
    queryId: uint64
    tonAmount: coins
}

struct (0x414e4c38) SweepProtocolFees {
    queryId: uint64
}

type AllowedCurveMessage =
    | InitLaunchpad
    | JettonTransferNotification
    | AdminChangedNotification
    | CurveBuy
    | CurveClaimRefund
    | CurveCheckRenounce
    | CurveOneShotMigrationDispatch
    | DepositTonLiquidity
    | SweepProtocolFees
    | JettonExcesses

// ============================================================================
// 4. ANLGRAM LP Locker V2 Messages
// ============================================================================

struct (0x414c5634) LockerObserveState {
    queryId: uint64
}

struct (0x414c5633) LockerWithdrawLp {
    queryId: uint64
    wantLocked: uint1
    amount: coins
}

struct LockerObservationEndpoints {
    poolAddress: address
    lpWalletAddress: address
}

struct (0x414c5635) LockerV2ObservationReceipt {
    queryId: uint64
    logicalTime: uint64
    receivedUnits: coins
    lockedUnits: coins
    freeUnits: coins
    pendingUnits: coins
    unlockTimestamp: uint64
    endpoints: Cell<LockerObservationEndpoints>
}

type AllowedLockerMessage =
    | LockerObserveState
    | JettonTransferNotification
    | LockerWithdrawLp
    | JettonExcesses

