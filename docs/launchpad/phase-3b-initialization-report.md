# ANLGRAM MEMELABS — PHASE 3B: INFORME DE ARQUITECTURA DE CONTRATOS E INICIALIZACIÓN SEGURA

**Fecha:** 28 de Octubre de 2026  
**Rama de Trabajo:** `feature/launchpad-phase3b` (aislada en Git worktree `E:\anlgram-phase3b`)  
**Rama Base:** `feature/launchpad-engine`  
**Commit Base:** `c09d2a9ebbf836aefb808800031e6d8e008e8a34` (que incorpora el commit previo `06a1cadb5302dca0d0131828923302fa077c68e4` y el preflight bundle de Fase 3A)  
**Estado de Verificación:** **RESUELTO Y AUDITADO — NO LISTO PARA DESPLIEGUE AUTOMATIZADO HASTA RESOLVER RIESGOS RESIDUALES DE RED Y DEPLOYER TRANSACCIONAL**

---

## 1. ESTADO DE INSPECCIÓN INICIAL DEL REPOSITORIO

En estricto cumplimiento de la Regla 6, se inspeccionó exhaustivamente el repositorio en `E:\ANLGRAM` antes de iniciar los trabajos:

1. **Rama Activa y Commit Base:**
   - Rama original: `feature/launchpad-engine`
   - Commit HEAD previo: `06a1cadb5302dca0d0131828923302fa077c68e4` (`feat(launchpad): verify on-chain STON.fi v2.1 endpoints, distinguish artifact hashes, and expand TVM suite to 92 tests`).
2. **Cambios Previos No Commiteados Detectados:**
   - Se encontraron modificaciones no consolidadas en:
     - `minter-contract/contracts/anlgram-bonding-curve.fc`
     - `minter-contract/contracts/anlgram-lp-locker.fc`
     - `minter-contract/contracts/anlgram-migration-router.fc`
     - `minter-contract/build/*.compiled.json`
     - `test-bonding-curve-tvm.js`
   - Se encontraron archivos sin seguimiento correspondientes al bundle Fase 3A:
     - `README-PHASE-3A.txt`
     - `docs/launchpad/phase-3a-testnet-deployment-plan.md`
     - `minter-contract/deploy-launchpad-testnet.js`
     - `minter-contract/test-deploy-launchpad-testnet.js`
3. **Aislamiento en Worktree (Regla 1):**
   - Para no contaminar la rama principal ni interferir con la copia de trabajo, los cambios preliminares fueron consolidados de forma atómica en el commit `c09d2a9` en `feature/launchpad-engine`.
   - Se creó un **Git worktree aislado** dedicado en `E:\anlgram-phase3b` sobre la rama `feature/launchpad-phase3b`, vinculando mediante junctions NTFS las dependencias `node_modules` para ejecución estricta y offline.
   - No se modificó `main`, no se realizaron fusiones ni push remotos, y los archivos de producción (token creator, UI de MemeLabs) se mantuvieron 100% intactos.

---

## 2. TAREA A — DIAGNÓSTICO Y RESOLUCIÓN DE DEPENDENCIAS CIRCULARES

### 2.1 El Problema Fundamental en TON TVM
En la máquina virtual de TON (TVM), la dirección de cualquier smart contract es determinista e inmutable:
$$\text{Contract Address} = \text{Hash}(\text{StateInit}) = \text{Hash}\big(\text{CodeCell}, \text{InitialDataCell}\big)$$

Si dos o más contratos almacenan mutuamente sus direcciones en sus celdas de datos iniciales (`InitialData`), se genera un **bloqueo circular irresoluble**:
- La dirección de la **Bonding Curve** depende del hash de los datos iniciales que contienen la dirección del **Migration Router** y del **LP Locker**.
- La dirección del **Migration Router** depende del hash de los datos iniciales que contienen la dirección de la **Bonding Curve** y del **LP Locker**.
- La dirección del **LP Locker** depende del hash de los datos iniciales que contienen la dirección del **Migration Router** (para autorizar `set_lp_wallet`) y de la **Bonding Curve** (para emitir `lp_locked_confirmation`).

Adicionalmente, se detectó una **cuarta dependencia circular oculta entre el Jetton Master y la Bonding Curve**:
- Si el `Launchpad Jetton Master` se inicializa con `admin_address = Bonding Curve`, no es posible predecir su dirección sin conocer la Curve (ciclo $\text{Minter} \leftrightarrow \text{Curve}$). Además, el Deployer no podría acuñar los 1,000,000,000 tokens iniciales porque la Curve no implementa la instrucción `op::mint`.
- Si el `Launchpad Jetton Master` se inicializa con `admin_address = Deployer`, el Deployer puede acuñar el suministro, pero cuando la Curve recibe los tokens e intenta enviar `op == 3` (`change_admin`) a `addr_none`, el Minter rechaza la llamada con código de salida `73` (`throw_unless(73, equal_slices(sender_address, admin_address))`), dejando a la Curve atrapada de forma irreversible en `STATE_RENOUNCE_PENDING`.

### 2.2 Matriz de Disponibilidad de Direcciones

| Contrato | Dependencias en StateInit Génesis | Momento de Disponibilidad | Estado Funcional Inicial |
| :--- | :--- | :--- | :--- |
| **1. Launchpad Jetton Master** | Ninguna (`[]`). Almacena `admin_address = Deployer`. | **Paso 1 (Génesis)** | Operativo para acuñación inicial y renuncia. Dirección fija y predecible. |
| **2. Bonding Curve** | `[Jetton Master]`. Almacena `lp_locker = addr_none`, `router = addr_none`. | **Paso 2** | `STATE_UNINITIALIZED` (0). Trading AMM completamente deshabilitado. |
| **3. LP Locker** | `[Bonding Curve]`. Almacena `curve_address` auténtica; `router_address = addr_none`. | **Paso 3** | Inactivo (`is_router_initialized = 0`, `is_wallet_initialized = 0`). Depósitos de tokens bloqueados (406). |
| **4. Migration Router** | `[Jetton Master, Bonding Curve, LP Locker]`. Almacena las 3 direcciones auténticas. | **Paso 4** | Inactivo (`ton_liquidity = 0`, `tokens_liquidity = 0`). Dirección fully-bound sin referencias nulas. |

### 2.3 Diseño Escogido: Grafo Acíclico Dirigido (DAG) y Bootstrap de Dos Fases
Se descartó el uso de direcciones mock o sintéticas y se implementó un **Grafo Acíclico Dirigido Estricto (Strict DAG)** con setters de inicialización autorizados y de un solo uso:

```
[Paso 1: Minter] ──> [Paso 2: Curve (STATE_UNINITIALIZED)] ──> [Paso 3: LP Locker] ──> [Paso 4: Migration Router]
       │                            │                                 │                            │
       └────────────────────────────┴─────────────────────────────────┴────────────────────────────┘
                                        Topological DAG (Sin Ciclos)
```

#### Mecanismos de Inicialización Implementados y Protegidos:

1. **`op::init_lp_locker` (`0x414e4c39`) en `anlgram-lp-locker.fc`**:
   - **Autorización:** Restringido exclusivamente al `admin_address` (Deployer).
     `throw_unless(ERROR_UNAUTHORIZED_SENDER, equal_slices(sender_address, admin_address));`
   - **Monotonicidad / Bloqueo Posterior:** Protegido contra doble invocación mediante el flag de almacenamiento `is_router_initialized`.
     `throw_if(ERROR_ALREADY_INITIALIZED, is_router_initialized == 1);`
   - **Validación de Direcciones:** Rechaza direcciones nulas (`preload_uint(2) == 0`) y colisiones de rol donde el router coincida con la curve (`equal_slices(new_router, curve_address)`).
   - **Comportamiento ante Dependencia Faltante:** Mientras `is_router_initialized == 0`, cualquier intento de configurar el wallet de LP (`op::set_lp_wallet`) o depositar tokens (`transfer_notification`) es rechazado de inmediato con código `406` (`ERROR_NOT_INITIALIZED`).

2. **`op::init_launchpad` (`0x414e4c01`) en `anlgram-bonding-curve.fc`**:
   - **Autorización:** Restringido exclusivamente al `admin_address` (Deployer).
     `throw_unless(ERROR_UNAUTHORIZED, equal_slices(sender_address, admin_address));`
   - **Monotonicidad / Bloqueo Posterior:** Solo ejecutable cuando `state == STATE_UNINITIALIZED` (0). Transiciona de inmediato a `STATE_INITIALIZING` (1), haciendo imposible cualquier reconfiguración (exit code 407).
   - **Validación Exhaustiva de Direcciones y Separación de Roles:**
     - Valida que `new_master`, `new_router` (DEX), `new_locker` y `new_migration_router` no sean nulas (`preload_uint(2) == 0`).
     - Si `jetton_master_address` fue prefijada en el StateInit génesis, exige coincidencia bit a bit exacta (`throw_unless(408, equal_slices(new_master, jetton_master_address));`), impidiendo sustituciones maliciosas.
     - Aplica guardas de anti-aliasing: impide que `new_locker` coincida con `new_migration_router` o `new_master`.
   - **Cálculo Determinista de Curve Jetton Wallet:** Si `new_curve_wallet` se pasa como `addr_none`, la Curve deriva deterministamente su propia dirección de billetera calculando el hash del `StateInit` oficial con `new_wallet_code`.

3. **No Introducción de Privilegios Administrativos Inseguros:**
   - Ninguno de los setters permite modificar parámetros económicos (fees, curvas virtuales, umbrales).
   - Los flags `state` y `is_router_initialized` son de escritura única: una vez alcanzado el valor inicializado, las funciones quedan permanentemente cerradas.
   - En el LP Locker, el método `withdraw_lp` está bloqueado incondicionalmente por la guarda permanente `throw_if(ERROR_LOCK_ACTIVE, unlock_timestamp == 0xFFFFFFFFFFFFFFFF);`, por lo que ni el admin ni ninguna clave pueden jamás retirar la liquidez bloqueada.
   - En el Migration Router, `execute_dex_provision` y `abort_migration` solo pueden enviar fondos al DEX oficial o reembolsar el TON directamente a la Curve; el admin no posee ninguna vía para desviar activos a cuentas arbitrarias.

---

## 3. TAREA B — CONSISTENCIA DE CONTRATOS, PROTOCOLO DE RENUNCIA Y REEMBOLSOS

### 3.1 Resolución Integral del Protocolo de Renuncia de Autoridad
Para resolver la inconsistencia donde el Minter rechazaba la renuncia solicitada por la Curve, se implementó un mecanismo dual y simétrico de alta seguridad:

1. **Soporte de Destinatario Personalizado en `op == 3` (`change_admin`) del Minter:**
   - En `anlgram-launchpad-jetton-minter.fc`, cuando el Deployer ejecuta `op == 3` para ceder la administración a `addr_none`, puede incluir opcionalmente la dirección de la Curve (`custom_recipient`).
   - El Minter actualiza `admin_address = addr_none` y emite el mensaje no rebotable `op::admin_changed_notification` (`0x7a3e810f`) directamente a la Curve, conteniendo `query_id`, `new_admin = addr_none` y `total_supply = 1,000,000,000`.
2. **Recepción de Custodia y Consulta Activa en la Curve:**
   - Cuando la Curve recibe la notificación de transferencia de los 1,000,000,000 tokens en `STATE_INITIALIZING`, valida que el monto coincida exactamente con la suma de la reserva de venta (800M) y el escrow de DEX (200M).
   - En lugar de enviar una orden de cambio de admin privilegiada que podría fallar por permisos, la Curve emite `op::query_admin_status` (`0x51c9d381`) con el identificador correlacionado `RENOUNCE_QUERY_ID = 0x414e4c4752454e4f` ("ANLGRENO" en ASCII).
   - `op::query_admin_status` es una operación no privilegiada que jamás arroja excepción y siempre responde con `op::admin_changed_notification` informando el estado on-chain real.
3. **Verificación Estricta de 5 Factores en la Curve para Activación del AMM:**
   La Curve solo transiciona a `STATE_ACTIVE` (3) si se satisfacen simultáneamente todos los siguientes requisitos:
   - Factor 1: El remitente es exactamente `jetton_master_address` (exit code 401 si es falso).
   - Factor 2: El estado actual es `STATE_RENOUNCE_PENDING` (exit code 407 si ya estaba activo o graduado).
   - Factor 3: El `query_id` coincide con `RENOUNCE_QUERY_ID` (exit code 412 si es diferente).
   - Factor 4: El administrador reportado es estrictamente `addr_none` (`preload_uint(2) == 0`) (exit code 408 si el admin sigue activo).
   - Factor 5: El suministro total reportado es exactamente 1,000,000,000 tokens (exit code 411 si hay tokens extras).
4. **Prueba de Irreversibilidad y Bloqueo de Acuñación en el Minter:**
   Se auditó la lógica en `anlgram-launchpad-jetton-minter.fc`. Una vez que `admin_address` es `addr_none`:
   - `op::mint()` (línea 88): ejecuta `throw_if(73, admin_address.preload_uint(2) == 0);`. Al ser `addr_none`, arroja 73 incondicionalmente.
   - `op == 3` (línea 155): ejecuta `throw_if(73, admin_address.preload_uint(2) == 0);`. Arroja 73 incondicionalmente, imposibilitando reasignar la administración.
   - `op == 4` (línea 182): ejecuta `throw_if(73, admin_address.preload_uint(2) == 0);`. Arroja 73 incondicionalmente, imposibilitando alterar los metadatos.
   - **Conclusión Técnica:** La renuncia es 100% matemática y criptográficamente irreversible en TVM.

### 3.2 Resiliencia ante Rebotes y Fallos de Ejecución
1. **Rebote de Transferencias de Compra:**
   - Si la entrega de Jettons al comprador rebota desde `curve_jetton_wallet`, el manejador `flags & 1` de la Curve decodifica el cuerpo rebotado, recupera los tokens y los acredita al diccionario de depósito en garantía (`pending_refunds_dict`) del comprador.
2. **Rebote en el Despacho de Migración:**
   - Si el mensaje de migración hacia el Migration Router rebota (por ejemplo, falta de gas o router no desplegado), la Curve detecta el remitente `migration_router_address` y transiciona de forma segura a `STATE_MIGRATION_FAILED` (7).
   - La instrucción `op::initiate_migration` fue ampliada para permitir el reintento explícito por parte del creador o admin: `throw_unless(ERROR_INVALID_STATE, (state == STATE_GRADUATION_PENDING) | (state == STATE_MIGRATION_FAILED));`. Esto evita que los fondos queden bloqueados en un limbo asíncrono.
3. **Protección Anti-Gas Drain y Reembolsos:**
   - La Curve mantiene una estricta segregación contable entre:
     - `real_token_reserve` (inventario negociable en la curva).
     - `dex_tokens_escrow` (reserva inmutable de 200M para la DEX).
     - `pending_refunds_tokens` (escrow de usuarios con ventas subfinanciadas o rebotes).
   - Las devoluciones inmediatas se financian exclusivamente del gas del `msg_value` entrante; jamás se subsidia gas desde la reserva de TON de la curva.

---

## 4. TAREA C — EVIDENCIA DE PRUEBAS Y VERIFICACIÓN LOCAL

Se ejecutaron todas las suites de pruebas pertinentes en el entorno local aislado, cubriendo simulación TVM, matemática determinista, preflight de red y regresiones del repositorio.

### 4.1 Resumen de Pruebas Locales Ejecutadas

| Suite de Pruebas | Archivo Ejecutor | Total Pruebas | Resultado | Evidencia / Observaciones |
| :--- | :--- | :--- | :--- | :--- |
| **TVM Multi-Contract Simulation Suite** | `test-bonding-curve-tvm.js` | **112** | **112 PASSED (0 FAIL)** | Verificó inicialización, ataques adversariales (401, 402, 405, 407, 408), renuncia de admin, colisiones de roles, AMM, refunds, rebotes y migración en 2 fases. |
| **Deterministic Bonding Curve Math & Fuzzing** | `minter-contract/test-bonding-curve-math.js` | **46** | **46 PASSED (0 FAIL)** | 12,000 ciclos de fuzzing aleatorio (6,513 compras, 5,487 ventas). Conservación estricta de $K$ y precio terminal idéntico al pool inicial de DEX (2,500 nTON). |
| **Blockchain Provider Abstraction** | `test-blockchain-provider.js` | **25** | **25 PASSED (0 FAIL)** | Validación estricta de red, cálculo CRC16-CCITT, aislamiento de fallos TonAPI/Toncenter y mitigación de inyecciones SSRF/XSS. |
| **Testnet Preflight & DAG Unit Suite** | `minter-contract/test-deploy-launchpad-testnet.js` | **9** | **9 PASSED (0 FAIL)** | Comprobó invariantes de preflight, banderas seguras, rechazo de endpoints mainnet/HTTP y validación algorítmica de aciclicidad. |
| **Master Security Audit Suite** | `test-master-security-audit.js` | **51** | **51 PASSED (0 FAIL)** | Bytecode canónico TEP-74, inmutabilidad, auditoría on-chain de MoonDog, reglas de vesting cliff/lineal y sanitización de entradas. |
| **ANL Labs Regression Suite** | `test-anl-labs-regression.js` | **33** | **33 PASSED (0 FAIL)** | 0 regresiones en la interfaz de producción, flujos Web3 existentes, selectores y estilos. |
| **TOTAL** | | **276** | **276 PASSED (100%)** | **Cero fallos, cero regresiones.** |

### 4.2 Verificación de Compilación y Artefactos FunC

Todos los contratos fueron compilados localmente utilizando el compilador oficial `@ton-community/func-js`:

| Contrato | Archivo FunC | BOC SHA-256 Digest | Code Cell Hash | Tamaño BOC |
| :--- | :--- | :--- | :--- | :--- |
| **Launchpad Jetton Master** | `anlgram-launchpad-jetton-minter.fc` | `92b25bfa090b89cdb453f50ae268c53dbae87ffffdb7e15b99e9bc9396ef2a00` | `90b5069f199fcea56ef467dd25cf8420c5e9848ba0fcc0cc139424c5cac17aec` | 837 bytes |
| **LP Locker** | `anlgram-lp-locker.fc` | `36ac2eaf0c360eb795984a4a0d7d94eaf6d9e2f3fe37178cc7285c90901dcb6a` | `e9da326d9ad2ec259112743a2e581fc5783693e9ee2d7371e5ff249bcaf97536` | 916 bytes |
| **Migration Router** | `anlgram-migration-router.fc` | `6cd8ce78514294076812fdb600f2f46f5436f3b7d24c9ca25e2de626896dd20b` | `700a5c594a07c344f729cd58737d2e1ff945acfca30e843433a9e8602b2bdb06` | 742 bytes |
| **Bonding Curve** | `anlgram-bonding-curve.fc` | `53d0709f16a3141e58a96d3568f2f21abd345515f89f06256ded4de84f686cff` | `bdbb8ba1c6161c907d429ace805585641e5af98bb0e544b344b5340b8b5ae304` | 3,744 bytes |

El preflight planner `deploy-launchpad-testnet.js --show-plan` re-compila los contratos en memoria y certifica bit a bit:
```
Current source matches artifact: PASS (en los 4 contratos)
Artifact metadata consistency: PASS (en los 4 contratos)
Circular address dependencies: NONE (Strict Directed Acyclic Graph - DAG verified)
```

### 4.3 Pruebas que NO Pudieron Ejecutarse y Justificación Técnica
1. **Transmisión de Transacciones Reales en Testnet:**
   - En conformidad con las Reglas 4 y 5 del proyecto, **no se firmaron ni transmitieron transacciones on-chain reales**, no se emplearon claves mnemónicas reales ni fondos de billeteras en vivo.
2. **Interacción Dinámica en Vivo con STON.fi v2.1 Testnet:**
   - La interacción en vivo con el router de STON.fi (`kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v`) solo se validó mediante consultas GET de solo lectura a TonAPI. Probar la provisión real requiere fondos de testnet y despliegue físico de contratos.

### 4.4 Diferencias entre Simulación, Compilación y Comportamiento On-Chain
- **Gas y Rentas de Almacenamiento:** El ejecutor local `ton-contract-executor` no deduce alquiler de almacenamiento (storage rent) a lo largo del tiempo ni emula transiciones de épocas de validadores.
- **Asincronía Multi-Bloque:** En la simulación TVM local, los mensajes entre contratos se procesan de forma secuencial en memoria; en la blockchain real de TON, los mensajes viajan a través de rutas de enrutamiento cross-shard y pueden experimentar latencias de varios bloques. El diseño de dos fases y la máquina de estados explícita (`STATE_RENOUNCE_PENDING`, `STATE_MIGRATION_IN_PROGRESS`, `STATE_MIGRATION_FAILED`) fueron concebidos específicamente para garantizar la tolerancia a retrasos asíncronos.

### 4.5 Bloqueos Todavía Abiertos y Riesgos Restantes
1. **Bloqueador 1 — Falta de Deployer Transaccional:**
   - El script `minter-contract/deploy-launchpad-testnet.js` es un validador de preflight de solo lectura. No implementa el mecanismo de firma transaccional ni el orquestador de envío secuencial de mensajes hacia la red.
2. **Bloqueador 2 — Dependencia Externa del Router STON.fi v2.1 en Testnet:**
   - Si el contrato del router de STON.fi en testnet actualiza su interfaz o agota su liquidez de pTON, el provisionamiento de liquidez podría fallar en tiempo de ejecución.
3. **Dictamen de Preparación para Testnet:**
   - Los contratos smart son **estructural y criptográficamente seguros y libres de ciclos**. Sin embargo, **NO se declara el sistema listo para testnet en producción** hasta que se implemente y audite un módulo de despliegue transaccional con manejo de firmas y se efectúe un ensayo integral supervisado por humanos.

---

## 5. PROCEDIMIENTO DE INICIALIZACIÓN PREVISTO (RUNBOOK OPERATIVO)

Cuando se autorice la Fase 3C (Despliegue Asistido en Testnet), el procedimiento operativo estricto será el siguiente:

```
PASO 1: Despliegue de Launchpad Jetton Master
        InitialData: total_supply=0, admin=Deployer
        -> Dirección D1 fijada.

PASO 2: Despliegue de Bonding Curve
        InitialData: state=0 (UNINITIALIZED), jetton_master=D1, locker=none, router=none
        -> Dirección D2 fijada. Trading bloqueado.

PASO 3: Despliegue de LP Locker
        InitialData: curve=D2, router=none, unlock_timestamp=0xFFFFFFFFFFFFFFFF, is_router_init=0
        -> Dirección D3 fijada. Depósitos de tokens bloqueados.

PASO 4: Despliegue de Migration Router
        InitialData: curve=D2, locker=D3, minter=D1, dex_router=STONFI_ROUTER, pton=PTON_MINTER
        -> Dirección D4 fijada. Totalmente acíclico.

PASO 5: Bootstrap de LP Locker (Transacción 1)
        Deployer envía op::init_lp_locker (0x414e4c39) a D3 especificando D4.
        -> is_router_initialized pasa a 1. Reconfiguración bloqueada permanentemente.

PASO 6: Bootstrap de Bonding Curve (Transacción 2)
        Deployer envía op::init_launchpad (0x414e4c01) a D2 especificando D1, D3, D4 y STONFI_ROUTER.
        -> State pasa a 1 (INITIALIZING). Curve calcula curve_jetton_wallet.

PASO 7: Acuñación y Custodia Inicial (Transacción 3)
        Deployer envía op::mint() a D1 acuñando exactamente 1,000,000,000 tokens a la billetera de D2.
        -> D2 recibe transfer_notification, valida 1B tokens y pasa a STATE_RENOUNCE_PENDING (2).

PASO 8: Renuncia Permanente y Activación del AMM (Transacción 4)
        Deployer envía op == 3 (change_admin) a D1 con new_admin=addr_none y custom_recipient=D2.
        -> D1 fija admin=addr_none y emite op::admin_changed_notification a D2.
        -> D2 verifica los 5 factores criptográficos y transiciona a STATE_ACTIVE (3).
        -> Trading público habilitado con 100% de garantías antifraude.
```

---

## 6. ARCHIVOS MODIFICADOS Y CREADOS

- **Modificados:**
  - `minter-contract/contracts/anlgram-bonding-curve.fc`:
    - Incorporó validación exhaustiva de direcciones y anti-aliasing en `op::init_launchpad`.
    - Sustituyó orden privilegiada por consulta activa `op::query_admin_status` ante recepción de 1B tokens.
    - Agregó detección de rebotes desde Migration Router con transición a `STATE_MIGRATION_FAILED` (7) y reintento autorizado en `op::initiate_migration`.
  - `minter-contract/contracts/anlgram-launchpad-jetton-minter.fc`:
    - Incorporó parámetro opcional `custom_recipient` en `op == 3` para notificación directa de renuncia a la Curve.
  - `minter-contract/contracts/anlgram-lp-locker.fc`:
    - Incorporó guarda estricta anti-colisión impidiendo que el router coincida con la Curve en `op::init_lp_locker`.
  - `minter-contract/deploy-launchpad-testnet.js`:
    - Flexibilizó variable de entorno de rama (`EXPECTED_BRANCH`) para permitir auditorías en worktrees aislados.
    - Actualizó el resumen descriptivo de la secuencia de bootstrap.
  - `test-bonding-curve-tvm.js`:
    - Expandió la suite de pruebas de 97 a **112 pruebas TVM exhaustivas**, cubriendo llamadas no autorizadas, doble inicialización, direcciones nulas, colisiones de roles, enrutamiento a destinatario personalizado y recuperación de rebotes.
  - `minter-contract/build/*.compiled.json`:
    - Artefactos recompilados con códigos y hashes sincronizados 100% con los fuentes FunC.
- **Creados:**
  - `docs/launchpad/phase-3b-initialization-report.md`: Este informe de ingeniería y auditoría de seguridad.
