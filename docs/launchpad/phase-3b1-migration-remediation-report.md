# ANLGRAM MEMELABS — FASE 3B.1: INFORME DE REMEDIACIÓN DE MIGRACIÓN DEX Y SEGURIDAD DE FONDOS

**Fecha:** 28 de Octubre de 2026  
**Rol:** Ingeniero Senior en FunC, TON, Jettons, STON.fi y Seguridad DeFi  
**Rama de Trabajo:** `feature/launchpad-phase3b1` (aislada en Git worktree `E:\anlgram-phase3b1`)  
**Commit Base:** `9038fc75b443817e1805b9a96123545b08988ae6` (*"feat(launchpad): complete Phase 3B acyclic contract architecture, renounce verification, and TVM test expansion"*)  
**Estado de Verificación Local:** **300 / 300 PRUEBAS SUPERADAS (100% ÉXITO) — 0 REGRESIONES**  
**Dictamen Final de Fase 3B.1:** **`BLOQUEADO PARA DESPLIEGUE EN TESTNET`** *(Arquitectura interna 100% remediada y probada en TVM; despliegue bloqueado exclusivamente por inoperatividad externa del Router STON.fi v2.1 en Testnet)*

---

## 1. BASE DE TRABAJO Y VERIFICACIÓN DE ESTADO INICIAL

En cumplimiento estricto de las reglas operativas:

1. **Existencia y Verificación del Commit Base:**
   - Se verificó la existencia del commit `9038fc7` en `feature/launchpad-phase3b`.
   - Se creó el Git worktree aislado `E:\anlgram-phase3b1` en la rama `feature/launchpad-phase3b1` con base en dicho commit.
   - Se crearon *junctions* NTFS para `node_modules` garantizando ejecución reproducible y aislada.
   - `main` permanece 100% inalterado; no se realizaron fusiones ni push remotos; el creador de Jettons de producción y la interfaz web permanecen intactos.

2. **Inspección de Informes Previos:**
   - Se examinó el informe de Fase 3B (`docs/launchpad/phase-3b-initialization-report.md`), confirmando la resolución previa de la topología acíclica (DAG) y la renuncia criptográfica irreversible del Minter.
   - Se analizó exhaustivamente el informe independiente de auditoría `docs/launchpad/stonfi-v2-independent-audit.md`, confrontando cada uno de sus 8 hallazgos contra el código real heredado.

---

## 2. MATRIZ DE ESTADO Y REMEDIACIÓN DE LOS 8 HALLAZGOS ORIGINALES

| Hallazgo Original | Severidad | Estado Previo (al inicio de 3B.1) | Estado Actual (Post-Remediación 3B.1) | Evidencia Técnica y Solución Aplicada |
| :--- | :---: | :---: | :---: | :--- |
| **H-01: Deadlock de Invocación (`execute_dex_provision`)** | **CRÍTICA** | Parcialmente mitigado (admitía admin, pero Curve no lo llamaba y no había guardas de estado) | **RESUELTO** | Autorización dual (`admin_address \| curve_address`), condicionada estrictamente a que `ton_liquidity > 0` y `tokens_liquidity > 0` hayan sido depositados por la Curve tras graduación. Monotónico (one-time) con código `405` ante reintentos duplicados. |
| **H-02: Conflicto Circular en LP Locker (`authorized_caller`)** | **CRÍTICA** | Resuelto en Fase 3B | **RESUELTO Y AUDITADO** | LP Locker desacopló el permiso de configuración de wallet (`router_address \| admin_address`) del receptor de confirmación, el cual se despacha incondicionalmente a la dirección fija `curve_address`. |
| **H-03: Violación TEP-74 en Envío de Jettons al DEX (Error 705)** | **CRÍTICA** | **PRESENTE (FATAL)** | **RESUELTO** | `anlgram-migration-router.fc` enviaba `op::transfer` a `router_token_wallet` (propiedad del DEX), causando rechazo TVM 705 (`owner != sender`). Se corrigió para enviar la orden a **`my_token_wallet`** (billetera propia del router), cumpliendo al 100% TEP-74 con `owner == sender`. |
| **H-04: Déficit de Gas Operacional (Error de Fase de Acción 37)** | **ALTA** | **PRESENTE (FATAL)** | **RESUELTO** | Salidas nominales ($500.37\text{ TON}$) superaban los $500.00\text{ TON}$ de reservas. Se incorporó una guarda estricta en `execute_dex_provision`: exige `msg_value >= 500,000,000` (0.50 TON) de gas adjunto. El principal de 500 TON se preserva intacto y el gas operacional se financia del mensaje invocador. |
| **H-05: Pérdida Irreversible de Fondos ante Rebotes/Abortos** | **ALTA** | **PRESENTE (FATAL)** | **RESUELTO** | Se implementó el manejador de rebotes (`flags & 1`) en Migration Router que recupera fondos devueltos y activa `is_failed = 1`. `op::abort_migration` fue ampliado para devolver **tanto el 100% del TON como el 100% de los 200M Jettons** a la Curve, restableciendo contabilidad a cero para impedir doble reembolso. |
| **H-06: Router STON.fi Testnet Inoperativo On-Chain (`exit_code: 9`)** | **ALTA** | **BLOQUEO EXTERNO VIGENTE** | **BLOQUEADO (EXTERNO)** | Verificado empíricamente on-chain: `kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v` falla en 100% de transacciones con `exit_code: 9` ("Cell underflow", 160 gas). Bloquea despliegue hasta actualización de STON.fi o router mock. |
| **H-07: Falta de Validación de Remitente en `transfer_notification`** | **MEDIA** | **PRESENTE (VULNERABILIDAD)** | **RESUELTO** | `anlgram-migration-router.fc` aceptaba cualquier notificación de tokens. Ahora exige estrictamente `throw_unless(401, equal_slices(from_address, curve_address))` y registra `sender_address` como `my_token_wallet`. Spammers y tokens falsos son rechazados con 401. |
| **H-08: Resolución Dinámica de Direcciones de Pool DEX** | **MEDIA** | Requiere orquestación off-chain | **GESTIONADO EN PREFLIGHT** | `deploy-launchpad-testnet.js` verifica la derivación de celdas StateInit antes de cualquier interacción, impidiendo configuraciones nulas en `set_lp_wallet`. |

---

## 3. ANÁLISIS TÉCNICO DETALLADO POR ÁREA

### A. Flujo de Control y Prevención de Bypass Administrativo
1. **Transición desde Graduación:**
   - La Curve alcanza la graduación cuando `real_token_reserve == 0` o `real_ton_reserve >= 500 TON`, pasando a `STATE_GRADUATION_PENDING` (4).
   - El creador o deployer ejecuta `op::initiate_migration` (`0x414e4c35`) adjuntando al menos 0.25 TON.
   - La Curve pasa a `STATE_MIGRATION_IN_PROGRESS` (5) y despacha atómicamente:
     - 200,000,000 tokens Jetton a `migration_router_address` vía `curve_jetton_wallet`.
     - 500 TON netos a `migration_router_address` con `op::deposit_ton_liquidity` (`0x414e4c36`).
2. **Recepción en Migration Router:**
   - Al recibir los 500 TON, `migration_router` valida que provengan de `curve_address` y suma `ton_liquidity`.
   - Al recibir los Jettons, valida que `from_address == curve_address`, registra `sender_address` como su `my_token_wallet` y acredita `tokens_liquidity`.
3. **Ejecución Autorizada e Idempotente (`execute_dex_provision`):**
   - Invocable únicamente por `admin_address` o `curve_address`.
   - Exige que `ton_liquidity > 0` y `tokens_liquidity > 0`. Esto **impide matemáticamente** que el administrador ejecute migraciones arbitrarias o prematuras si la Curve no ha alcanzado la graduación y transferido sus reservas.
   - Valida que `is_initialized == 0`. Al ejecutarse, fija `is_initialized = 1`. Cualquier segundo intento es abortado de inmediato con código `405` (`ERROR_ALREADY_INITIALIZED`), erradicando ejecuciones duplicadas.

### B. LP Locker y Modelo de Liquidez STON.fi v2.1
1. **Modelo de Liquidez Real en STON.fi v2.1:**
   - En STON.fi CPI v2.1, el contrato Pool actúa como Minter del activo LP.
   - La posición de liquidez **es un Jetton TEP-74 transferible** (`LpJetton`).
   - El contrato de provisión cruzada (`cross_provide_lp_body`) instruye al Pool a emitir los tokens LP directamente a `to_address = lp_locker_address`.
2. **Custodia y Confirmación:**
   - El LP Locker recibe la notificación de transferencia exclusivamente desde su `lp_wallet_address` verificada (preconfigurada una sola vez por el Migration Router).
   - Acumula `lp_amount_locked` y emite el mensaje no rebotable `op::lp_locked_confirmation` (`0x414e4c33`) directamente a `curve_address`.
   - La Curve valida `sender == lp_locker_address` y `state == STATE_MIGRATION_IN_PROGRESS`, transicionando finalmente a `STATE_GRADUATED` (6).
   - Con `unlock_timestamp = 0xFFFFFFFFFFFFFFFF`, cualquier intento de retiro en el LP Locker arroja `403` (`ERROR_LOCK_ACTIVE`) incondicionalmente.

### C. Trazabilidad Completa de Transferencias TEP-74

```
[1. Curve Jetton Wallet]  ──(transfer_notification)──>  [2. Migration Router]
     (Dueño: Curve)                                         (Captura my_token_wallet)
                                                                    │
                                                            (op::transfer a my_token_wallet)
                                                            (owner == sender -> ¡PASA!)
                                                                    ▼
[4. STON.fi DEX Router]  <──(transfer_notification)───  [3. Router Token Wallet]
     (Procesa provide_lp)                                   (Dueño: STON.fi Router)
```

- **Corrección Crucial del Error 705:** En la implementación anterior, el mensaje saliente apuntaba a `router_token_wallet`. Dado que el dueño de esa billetera es `dex_router_address` y el remitente era `migration_router_address`, la billetera Jetton invocaba `throw_unless(705, equal_slices(owner_address, sender_address))` y abortaba la transacción.
- **Implementación Remediada:** El mensaje `op::transfer` se envía ahora a **`my_token_wallet`** con `to_address = dex_router_address`. `my_token_wallet` verifica que su dueño coincida con el remitente (`migration_router_address`), debita el saldo local y emite `internal_transfer` a `router_token_wallet`, la cual entrega los tokens al DEX Router sin arrojar jamás el código 705.

### D. Presupuesto de TON, Gas y Contabilidad Libre de Descubiertos

#### Balance Contable en `execute_dex_provision`:

| Concepto de Flujo | Dirección | Importe de Principal | Gas Operacional Adjunto | Total Transferido |
| :--- | :---: | :---: | :---: | :---: |
| **Reserva TON de la Curva** | Entrada | $500.000\text{ TON}$ | $0.000\text{ TON}$ | $+500.000\text{ TON}$ |
| **Gas de Invocación Operacional** | Entrada | $0.000\text{ TON}$ | $\ge 0.500\text{ TON}$ | $+0.500\text{ TON}$ |
| **Leg 1: `set_lp_wallet`** | Salida | $0.000\text{ TON}$ | $0.020\text{ TON}$ | $-0.020\text{ TON}$ |
| **Leg 2: Jetton `provide_lp`** | Salida | $0.000\text{ TON}$ | $0.200\text{ TON}$ | $-0.200\text{ TON}$ |
| **Leg 3: pTON `ton_transfer`** | Salida | $500.000\text{ TON}$ | $0.150\text{ TON}$ | $-500.150\text{ TON}$ |
| **BALANCE NETO RESIDUAL** | **Superávit** | **$0.000\text{ TON}$** | **$+0.130\text{ TON}$** | **$+0.130\text{ TON}$** |

- **Resultado:** El balance disponible en el contrato ($500.50\text{ TON}$) cubre holgadamente los $500.37\text{ TON}$ de débitos requeridos por las tres órdenes salientes.
- **Garantía:** El error de fase de acción de TVM (Action Phase Error 37 por saldo insuficiente) queda **matemáticamente imposibilitado**.

### E. Rebotes, Recuperación de Fondos y Prevención de Doble Reembolso
1. **Tratamiento de Rebotes en Migration Router:**
   - Si el mensaje de provisión a pTON o a la billetera Jetton rebota (`flags & 1`), el manejador decodifica el rebote, marca `is_failed = 1`, resetea `is_initialized = 0` y restaura `ton_liquidity` con los fondos recuperados.
2. **Rescate Bipolar de Fondos (`op::abort_migration`):**
   - El llamador autorizado (`curve_address` o `admin_address`) puede abortar si la migración falló.
   - Si `ton_liquidity > 0`: Despacha `op::deposit_ton_liquidity` devolviendo los TON a `curve_address`.
   - Si `tokens_liquidity > 0`: Despacha `op::transfer` devolviendo los 200M Jettons a `curve_address`.
   - Pone a cero `ton_liquidity = 0` y `tokens_liquidity = 0`.
   - **Prevención de Doble Reembolso:** Una segunda llamada a `abort_migration` encuentra saldos en 0 y emite exactamente 0 mensajes salientes, garantizando idempotencia estricta.
3. **Conciliación en la Curve:**
   - La Curve reconoce el reembolso de TON (`op == 0x414e4c36`) de `migration_router_address`, restituye `real_ton_reserve` y fija `state = STATE_MIGRATION_FAILED` (7).
   - La Curve reconoce el retorno de los 200M Jettons (`op::transfer_notification` con `from_address == migration_router_address`), restituye `dex_tokens_escrow` y fija `state = STATE_MIGRATION_FAILED` (7).
   - **Reintento Autorizado:** Desde `STATE_MIGRATION_FAILED`, el creador o deployer puede invocar nuevamente `op::initiate_migration` una vez subsanada la causa externa.
4. **Límites Reales de Recuperabilidad:**
   - *Límite 1 (Custodia Externa DEX):* Si STON.fi procesa parcialmente los depósitos en su pool pero no acuña los LP tokens ni rebota el mensaje, los fondos quedan dentro de los contratos de STON.fi. Los smart contracts de ANLGRAM no pueden forzar la extracción de contratos de terceros sin soporte de su protocolo.
   - *Límite 2 (Gas Forward):* Los rebotes devuelven el valor menos las tarifas de gas consumidas en el trayecto ($V_{\text{ret}} = V_{\text{in}} - \text{fees}$).

---

## 4. EVIDENCIA DE COMPILACIÓN Y PRUEBAS LOCALES

### 4.1 Verificación de Compilación FunC (`@ton-community/func-js`)

| Contrato | Archivo Fuente | BOC SHA-256 Digest | Code Cell Hash | Tamaño BOC |
| :--- | :--- | :--- | :--- | :---: |
| **Launchpad Jetton Master** | `anlgram-launchpad-jetton-minter.fc` | `92b25bfa090b89cdb453f50ae268c53dbae87ffffdb7e15b99e9bc9396ef2a00` | `90b5069f199fcea56ef467dd25cf8420c5e9848ba0fcc0cc139424c5cac17aec` | 837 bytes |
| **LP Locker** | `anlgram-lp-locker.fc` | `36ac2eaf0c360eb795984a4a0d7d94eaf6d9e2f3fe37178cc7285c90901dcb6a` | `e9da326d9ad2ec259112743a2e581fc5783693e9ee2d7371e5ff249bcaf97536` | 916 bytes |
| **Migration Router** | `anlgram-migration-router.fc` | `35c57ebf83cb11dd2c7b6801437ba5d25efdae8912accaea632210071dda2139` | `ad789269bb790232a0fcb7a4c711099e295496298db9b1fdeaac65ada26ef844` | 1,188 bytes |
| **Bonding Curve** | `anlgram-bonding-curve.fc` | `5236087b15e03c2e4299ec5a49c4d844e44b050c9cc19efdcccc001db9cf1d55` | `6532b33dca08f475dcb6478aba70929e7b5cece1e55167b9203247d3c67a1523` | 3,981 bytes |

El preflight planner re-compila los contratos en memoria y certifica:
```
Current source matches artifact: PASS (en los 4 contratos)
Artifact metadata consistency: PASS (en los 4 contratos)
Circular address dependencies: NONE (Strict Directed Acyclic Graph - DAG verified)
```

### 4.2 Resultados Exhaustivos de Pruebas Locales (300 / 300 PASADAS)

```
[Suite 1] TVM Multi-Contract Simulation Suite (test-bonding-curve-tvm.js)
          136 / 136 PASSED (0 FAIL)
          - Suite 1 (Minter): 9 pruebas (renuncia criptográfica, anti-minting exit 73).
          - Suite 2 (LP Locker): 16 pruebas (anti-frontrunning, confirmación, permanent lock 403).
          - Suite 3 (Bonding Curve AMM): 55 pruebas (invariants K, pricing, refunds, graduation).
          - Suite 4 (Migration Router TL-B): 16 pruebas (depósitos, despacho DEX, abort simple).
          - Suite 5 (Remediación 3B.1): 40 pruebas específicas:
            * Rechazo de notificaciones de tokens spam (exit 401).
            * Rechazo de transferencias con 0 tokens (exit 410).
            * Rechazo de execute_dex_provision con gas < 0.50 TON (exit 409).
            * Rechazo de execute_dex_provision con direcciones nulas (exit 408).
            * Ejecución exitosa con >= 0.50 TON gas sin descubierto en fase de acción.
            * Bloqueo estricto de ejecuciones duplicadas de provisión (exit 405).
            * Verificación de destino TEP-74 en my_token_wallet (eliminación error 705).
            * Recuperación de mensajes rebotados con restauración de ton_liquidity.
            * Reembolso dual (TON + Jettons) en abort_migration.
            * Idempotencia y prevención de doble reembolso en abort_migration.
            * Recepción de TON devuelto en Curve con restauración de real_ton_reserve.
            * Rechazo de retorno de TON de llamador no autorizado en Curve (exit 401).
            * Recepción de 200M Jettons devueltos en Curve con restauración de dex_tokens_escrow.
            * Reintento autorizado de initiate_migration desde STATE_MIGRATION_FAILED.

[Suite 2] Deterministic Math & Fuzzing (minter-contract/test-bonding-curve-math.js)
          46 / 46 PASSED (0 FAIL)
          - 12,000 ciclos aleatorios de fuzzing (6,513 compras, 5,487 ventas).
          - 0 violaciones de solvencia económica, precio terminal exacto a pool inicial (2,500 nTON).

[Suite 3] Blockchain Provider Abstraction (test-blockchain-provider.js)
          25 / 25 PASSED (0 FAIL)
          - Validación CRC16-CCITT, aislamiento de fallos y defensas SSRF/XSS.

[Suite 4] Testnet Preflight & DAG Unit Suite (minter-contract/test-deploy-launchpad-testnet.js)
          9 / 9 PASSED (0 FAIL)
          - Aciclicidad, verificación estricta de red y variables de entorno.

[Suite 5] Master Security Audit Suite (test-master-security-audit.js)
          51 / 51 PASSED (0 FAIL)
          - Bytecode canónico TEP-74, auditoría MoonDog, reglas de vesting y sanitización.

[Suite 6] ANL Labs Regression Suite (test-anl-labs-regression.js)
          33 / 33 PASSED (0 FAIL)
          - 0 regresiones en interfaz de usuario, flujos Web3 y estilos existentes.

TOTAL GENERAL: 300 / 300 PRUEBAS SUPERADAS (100% ÉXITO)
```

---

## 5. ESTADO DEL ROUTER STON.FI V2.1 EN TESTNET

- **Dirección Verificada On-Chain:** `kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v` (`0:0b87e24104828aee0af4a380157fd2599c4b059dda8ed2a4c2c93f83fb206c5a`).
- **Estado de Ejecución:** **INOPERATIVO (FATAL EXTERNO)**.
- **Evidencia Empírica On-Chain:**
  - Invocación de `get_router_data`: Arroja **`exit_code: 9` ("Cell underflow", 160 gas consumido, 2 pasos de cómputo)**.
  - Historial de transacciones de octubre de 2026: El 100% de las transacciones entrantes con opcodes de provisión y swaps fallaron con `exit_code: 9`.
  - Causa técnica: La celda raíz de almacenamiento del contrato en Testnet no coincide con la especificación de desempaquetado de la librería masterchain vinculada.
- **Consecuencia Operativa:** Ningún contrato en TON Testnet puede actualmente aprovisionar liquidez en este router sin fallar por causas ajenas a ANLGRAM.

---

## 6. ARCHIVOS MODIFICADOS EN FASE 3B.1

1. [`minter-contract/contracts/anlgram-migration-router.fc`](file:///e:/anlgram-phase3b1/minter-contract/contracts/anlgram-migration-router.fc):
   - Corrección TEP-74: Despacho de `op::transfer` a `my_token_wallet` en lugar de `router_token_wallet` (eliminando exit 705).
   - Presupuesto de gas: Requisito de `msg_value >= 0.50 TON` para `execute_dex_provision` (eliminando error 37).
   - Validación de remitente en `transfer_notification` (`from_address == curve_address`, eliminando H-07).
   - Manejador de rebotes (`flags & 1`) con recuperación de TON y activación de `is_failed = 1`.
   - Reembolso dual (TON + Jettons) en `op::abort_migration` con puesta a cero para evitar doble gasto.
2. [`minter-contract/contracts/anlgram-bonding-curve.fc`](file:///e:/anlgram-phase3b1/minter-contract/contracts/anlgram-bonding-curve.fc):
   - Agregado manejador para retorno de TON (`op == 0x414e4c36`) con restauración de `real_ton_reserve`.
   - Agregado subflujo de retorno de Jettons en `transfer_notification` con restauración de `dex_tokens_escrow`.
   - Exposición de método getter `get_dex_escrow()`.
3. [`minter-contract/build/*.compiled.json`](file:///e:/anlgram-phase3b1/minter-contract/build):
   - Recompilación y sincronización bit a bit de los artefactos FunC generados.
4. [`test-bonding-curve-tvm.js`](file:///e:/anlgram-phase3b1/test-bonding-curve-tvm.js):
   - Expansión de la suite TVM de 112 a **136 pruebas exhaustivas** cubriendo todos los escenarios de remediación.
5. [`docs/launchpad/phase-3b1-migration-remediation-report.md`](file:///e:/anlgram-phase3b1/docs/launchpad/phase-3b1-migration-remediation-report.md):
   - Este informe exhaustivo de auditoría y remediación técnica.

---

## 7. DICTAMEN FINAL

### **`BLOQUEADO PARA DESPLIEGUE EN TESTNET`**

**Fundamento Técnico:**
1. **Contratos Internos ANLGRAM:** Los 4 smart contracts del launchpad (`anlgram-bonding-curve.fc`, `anlgram-launchpad-jetton-minter.fc`, `anlgram-lp-locker.fc`, `anlgram-migration-router.fc`) están **completamente remediados, conformes con los estándares TEP-74 y TL-B de STON.fi, libres de ciclos y verificados con 300 pruebas locales exitosas**.
2. **Bloqueo Externo Infranqueable:** El contrato oficial del Router STON.fi v2.1 en TON Testnet (`kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v`) está averiado on-chain (`exit_code: 9`). Intentar una migración real en testnet causará el aborto inevitable de la transacción a nivel de máquina virtual en la llamada al router externo.
3. **Condición para Desbloqueo (Fase 3C):**
   - Obtener de STON.fi la dirección de un Router Testnet v2.1/v2.2 reparado y funcional (`get_router_data` con `exit_code: 0`), o desplegar un mock verificado del Router STON.fi en Testnet para las pruebas de integración de ANLGRAM.
   - Implementar el módulo transaccional de despliegue con firma segura bajo supervisión humana.
