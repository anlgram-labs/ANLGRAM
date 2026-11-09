tolk 1.2;

// Formal Tolk Storage & Getter Reply Schemas for ANLGRAM VNext / Generation-2
// Reference-only schema: preserves exact FunC cell/ref bit layouts.
// Consulted TON Docs: https://docs.ton.org/llms/tolk/features/contract-storage/content.md

struct CurveAddressesPrimary {
    adminAddress: address
    creatorAddress: address
    treasuryAddress: address
}

struct CurveAddressesSecondary {
    jettonMasterAddress: address
    curveJettonWallet: address?
    dexRouterAddress: address
}

struct CurveAddressesMigration {
    lpLockerAddress: address
    migrationRouterAddress: address
}

struct CurveAddressTree {
    primary: CurveAddressesPrimary
    secondary: Cell<CurveAddressesSecondary>
    migration: Cell<CurveAddressesMigration>
}

struct CurveReservesCell {
    realTonReserve: coins
    realTokenReserve: coins
    accruedProtocolFees: coins
    pendingRefundsTokens: coins
    virtualTonReserve: coins
    virtualTokenReserve: coins
    graduationThresholdTon: coins
    dexTokensEscrow: coins
}

struct CurveDictsCell {
    pendingRefundsDict: map<uint256, cell>
    jettonWalletCode: cell
}

// Matches anlgram-bonding-curve-dispatch-v2.fc root cell layout:
// [state:uint8][protocol_fee_bps:uint16 (100)] ^[addresses] ^[reserves] ^[dicts]
struct CurveStorage {
    state: uint8
    protocolFeeBps: uint16
    addresses: Cell<CurveAddressTree>
    reserves: Cell<CurveReservesCell>
    dicts: Cell<CurveDictsCell>
}

struct BuyQuoteV2Reply {
    tokensOut: coins
    feeTon: coins
    consumedGrossTon: coins
    refundTon: coins
    willGraduate: int
}

struct SellQuoteReply {
    netTonOut: coins
    feeTon: coins
}

// Matches anlgram-lp-locker-v2.fc root cell layout:
// [version:uint8 (2)] ^[immutable_config] ^[accounting] [seen:map<uint256, uint1>] [requests:map<uint64, cell>]
struct LockerAccountingCell {
    received: coins
    lockedAvailable: coins
    unlockedAvailable: coins
    pending: coins
    pendingKind: uint1
    pendingQuery: uint64
    nextQuery: uint64
    unlockTimestamp: uint64
}

struct LockerStorage {
    version: uint8
    immutableConfig: cell
    accounting: Cell<LockerAccountingCell>
    seenNotifications: map<uint256, bool>
    inFlightRequests: map<uint64, cell>
}

