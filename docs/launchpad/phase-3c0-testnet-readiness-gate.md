# ANLGRAM MemeLabs — Informe de Fase 3C.0: Puerta de Decisión Final para Preparación de Despliegue en Testnet (Readiness Gate)

**Documento:** `docs/launchpad/phase-3c0-testnet-readiness-gate.md`  
**Fecha:** 28 de Octubre de 2026  
**Rama Base Auditada:** `feature/launchpad-phase3b2`  
**Commit de Referencia:** `e70c5652a1d202617b59b5c95a0c298fcb7e5c06`  
**Ambiente de Ejecución:** Git Worktree Aislado (`feature/launchpad-phase3c0`)  
**Clasificación de Seguridad:** Auditoría Técnica de Arquitectura, Contratos Inteligentes TVM y Protocolos DeFi  
**Regla de Operación:** Estricto modo de solo lectura (Read-Only). Cero transmisiones transaccionales, cero firmas, cero solicitudes de llaves privadas o fondos.

---

## 1. RESUMEN EJECUTIVO Y DECISIÓN FINAL

El presente informe constituye la evaluación técnica formal requerida por la compuerta de decisión **Phase 3C.0 Readiness Gate** para determinar si la suite de contratos inteligentes, la arquitectura de integración DEX y el herramental de despliegue de **ANLGRAM MemeLabs** están aptos para iniciar la fase de preparación de despliegue supervisado en TON Testnet.

### Veredicto de la Compuerta:
```
═══════════════════════════════════════════════════════════════════════════
                    DECISIÓN TÉCNICA PHASE 3C.0:
                       REQUIERE CORRECCIONES
═══════════════════════════════════════════════════════════════════════════
```

### Síntesis del Dictamen:
1. **Viabilidad Técnica Comprobada:** Los contratos base de ANLGRAM MemeLabs resuelven con éxito los 5 bloqueos arquitectónicos críticos previos (renuncia de administración on-chain, verificación de custodia LP en 2 fases, prevención de drenaje de gas por slippage, resolución del grafo cíclico de despliegue y descubrimiento de un router externo funcional). Las 7 suites de pruebas locales (325 pruebas unitarias, matemáticas y de simulación TVM) fueron reproducidas al 100% sin fallos sobre el commit `e70c565`.
2. **Router Externo Compatible Identificado y Verificado:** El Candidato B (*STON.fi DEX v2.2 HackenProof*, `kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn`) responde exitosamente a llamadas RPC de solo lectura, confirmando estado activo, `is_locked == 0`, compatibilidad de protocolo v2.2 (`[2, 2, "release"]`) y transacciones recientes en TON testnet.
3. **Condición Bloqueante Identificada en `e70c565` (Vulnerabilidad Crítica de Rug-Pull):**  
   La introducción de `op::set_migration_router` (`0x414e4c37`) en `anlgram-bonding-curve.fc` durante la Fase 3B.2 permite a la dirección de administración o creador modificar arbitrariamente la dirección del router de migración durante los estados `STATE_GRADUATION_PENDING` (4) y `STATE_MIGRATION_FAILED` (7). Dado que en `STATE_GRADUATION_PENDING` la curva custodia **500 TON reales** aportados por los usuarios y **200,000,000 tokens DEX**, un administrador malicioso podría redirigir la totalidad de la liquidez hacia una wallet personal arbitraria antes de invocar `op::initiate_migration`. Esto vulnera el criterio mandatario de seguridad económica (Criterio 3 de la compuerta) y debe corregirse restringiendo dicha mutación exclusivamente a `STATE_INITIALIZING` (estado previo a la activación del trading) o eliminándola para garantizar inmutabilidad absoluta.
4. **Delimitación de Scripts:** Se constata que `minter-contract/deploy-launchpad-testnet.js` es un validador estricto de preflight y planificador de dependencias topológicas DAG sin capacidad alguna de firma, custodia de mnemónicos ni transmisión transaccional. El script de ejecución real de despliegue debe construirse como parte de la Fase 3C.1.

---

## 2. VERIFICACIÓN DEL ESTADO BASE Y REPRODUCCIÓN DE PRUEBAS

### 2.1 Inspección de Git y Entorno
- **Commit Base:** `e70c5652a1d202617b59b5c95a0c298fcb7e5c06` (*feat(launchpad): complete Phase 3B.2 router discovery, reconfigurable migration target, and 325 TVM test expansion*).
- **Árbol de Trabajo:** Limpio, verificado en worktree aislado `feature/launchpad-phase3c0` sin colisiones con la rama `main` ni `feature/launchpad-engine`.
- **Integridad de Artefactos BOC:** Se confirmó la concordancia criptográfica de los artefactos compilados en `minter-contract/build/` contra las fuentes en `minter-contract/contracts/`.

### 2.2 Reproducción Independiente de Suites de Prueba Locales
Se ejecutaron de forma independiente y secuencial las 7 suites de prueba del repositorio en el entorno aislado, validando 325 aserciones sin ninguna omisión:

| Suite de Pruebas | Archivo Ejecutable | Pruebas | Estado | Alcance y Propósito |
| :--- | :--- | :---: | :---: | :--- |
| **1. TVM Contracts Simulation** | `test-bonding-curve-tvm.js` | 150 | ✅ PASS | Simulación TVM en memoria de Minter, LP Locker, Migration Router y Bonding Curve (ataques adversariales, anti-drain, AMM, estados). |
| **2. DEX Router Candidates** | `test-router-candidates-tvm.js` | 11 | ✅ PASS | Validación de Candidatos A, B y C; TL-B `cross_provide_lp_body` y prevención de atrapamiento de fondos. |
| **3. Bonding Curve Math** | `minter-contract/test-bonding-curve-math.js` | 46 | ✅ PASS | Conservación de invariante $K$, cotizaciones buy/sell, deducción de fees (1%), no-arbitraje y 12,000 ciclos de fuzzing determinista. |
| **4. Blockchain Provider** | `test-blockchain-provider.js` | 25 | ✅ PASS | Abstracción de proveedores RPC (TonAPI / TonCenter), failover conservador, checksum CRC16-CCITT y aislamiento testnet/mainnet. |
| **5. Preflight Deployer Tests** | `minter-contract/test-deploy-launchpad-testnet.js` | 9 | ✅ PASS | Validación de flags permitidos, DAG topológico acíclico, fail-closed por configuración ausente y verificación de solo lectura. |
| **6. Master Security Audit** | `test-master-security-audit.js` | 51 | ✅ PASS | Hashes canónicos de bytecode TEP-74, inmutabilidad de código, renuncia administrativa on-chain y bloqueo de vesting. |
| **7. ANL Labs Flow Regression** | `test-anl-labs-regression.js` | 33 | ✅ PASS | Integración de interfaz UI, 5 pasos del flujo meme lab, selectores CSS, validadores de entrada y preservación Web3. |
| **TOTAL GENERAL** | **7 Suites** | **325** | **100% PASS** | **Cero fallos, cero regresiones, cero omisiones.** |

---

## 3. AUDITORÍA DE SEGURIDAD DE `op::set_migration_router` Y PROPUESTA DE DISEÑO DEFINITIVO

### 3.1 Análisis de la Implementación en `e70c565`
En el commit `e70c565` (Fase 3B.2), se introdujo en `minter-contract/contracts/anlgram-bonding-curve.fc` el handler para `op::set_migration_router` (`0x414e4c37`):

```fc
;; minter-contract/contracts/anlgram-bonding-curve.fc (Líneas 771-793 en commit e70c565)
if (op == op::set_migration_router) {
    throw_unless(ERROR_UNAUTHORIZED, equal_slices(sender_address, creator_address) | equal_slices(sender_address, admin_address));
    throw_unless(ERROR_INVALID_STATE, (state == STATE_GRADUATION_PENDING) | (state == STATE_MIGRATION_FAILED));

    slice new_migration_router = in_msg_body~load_msg_addr();
    throw_if(408, new_migration_router.preload_uint(2) == 0);
    throw_if(408, equal_slices(new_migration_router, my_address()));
    throw_if(408, equal_slices(new_migration_router, lp_locker_address));
    throw_if(408, equal_slices(new_migration_router, jetton_master_address));
    throw_if(408, equal_slices(new_migration_router, curve_jetton_wallet));

    migration_router_address = new_migration_router;
    save_data(
        state, admin_address, creator_address, treasury_address,
        jetton_master_address, curve_jetton_wallet, dex_router_address, lp_locker_address, migration_router_address,
        real_ton_reserve, real_token_reserve, accrued_protocol_fees, pending_refunds_tokens,
        virtual_ton_reserve, virtual_token_reserve, graduation_threshold_ton, dex_tokens_escrow,
        pending_refunds_dict, jetton_wallet_code
    );
    return ();
}
```

### 3.2 Respuestas a las Cuestiones de Auditoría Requeridas

1. **¿Qué campo de estado modifica?**  
   Modifica exclusivamente `migration_router_address` dentro de la celda de almacenamiento persistente `c4` (ubicada en la sub-referencia `sub_addrs2` junto a `lp_locker_address`).
2. **¿Cambia la dirección del Migration Router de ANLGRAM o la dirección del Router externo de STON.fi?**  
   Cambia la dirección del **Migration Router interno de ANLGRAM**. No modifica `dex_router_address` (el router externo de STON.fi), el cual se encuentra congelado en `sub_addrs1` desde `op::init_launchpad`.
3. **¿Qué direcciones están autorizadas a invocarlo?**  
   `creator_address` o `admin_address`.
4. **¿En qué estados del ciclo de vida está permitido en `e70c565`?**  
   En `STATE_GRADUATION_PENDING` (4) y en `STATE_MIGRATION_FAILED` (7).
5. **¿Puede ejecutarse cuando hay activos en tránsito o una migración parcial?**  
   Durante `STATE_MIGRATION_IN_PROGRESS` (5), el contrato arroja `ERROR_INVALID_STATE` (407). No obstante, en `STATE_GRADUATION_PENDING` (4), la curva ya acumula la totalidad de las reservas recaudadas.
6. **¿Puede redirigir fondos hacia un contrato arbitrario controlado por un administrador? (Vulnerabilidad de Rug-Pull)**  
   **SÍ. CRÍTICO.**  
   En `STATE_GRADUATION_PENDING`, la curva almacena exactamente `500 TON` y `200,000,000 tokens`. Las únicas validaciones presentes sobre `new_migration_router` son que no sea nula (`preload_uint(2) != 0`) y que no colisione con el Curve, Locker, Master o Jetton Wallet. **El contrato no valida el hash de código de la dirección destino.** En consecuencia, un creador o administrador puede enviar la dirección de una wallet personal, y a continuación invocar `op::initiate_migration` (`0x414e4c35`). La curva transferirá de inmediato los 500 TON y los 200M tokens a la wallet del atacante, consumando un drenaje de liquidez total.
7. **¿Puede una llamada posterior alterar la confianza del usuario una vez habilitado el trading?**  
   **SÍ.** Los compradores adquieren tokens en la curva de vinculación bajo la garantía de que al alcanzar los 500 TON de recaudación, los fondos serán inyectados forzosamente en un pool de liquidez con quema/bloqueo irreversible de los tokens LP. La existencia de un mecanismo que permita cambiar el destino de los fondos tras completar la fase de venta destruye la garantía de confianza (*trustless invariant*).
8. **¿Cuándo debe el contrato rechazar cambios de esta dirección?**  
   El contrato debe rechazar cualquier alteración de `migration_router_address` una vez que el trading esté activo (`STATE_ACTIVE`, estado 3) o una vez iniciado el proceso de renuncia de administración (`STATE_RENOUNCE_PENDING`, estado 2). Únicamente puede admitirse durante la fase de inicialización técnica previa al lanzamiento (`STATE_INITIALIZING`, estado 1), cuando el balance de usuarios es estrictamente cero.

### 3.3 Colisión de Opcodes (`0x414e4c37`)
Se observó una dualidad en el identificador de opcode `0x414e4c37`:
- En `anlgram-bonding-curve.fc`: se le asignó el nombre `op::set_migration_router`.
- En `anlgram-migration-router.fc`: define `op::execute_dex_provision = 0x414e4c37;`.  
Aunque operan en contratos distintos y no colisionan en ejecución TVM, genera confusión semántica en el herramental de despliegue y auditoría.

### 3.4 Propuesta de Diseño Definitivo (Corrección Mandatoria)
Para eliminar de forma concluyente el riesgo de rug-pull, se debe implementar la siguiente regla estricta:

```fc
;; DISEÑO DEFINITIVO SEGURO:
if (op == op::set_migration_router) {
    throw_unless(ERROR_UNAUTHORIZED, equal_slices(sender_address, creator_address) | equal_slices(sender_address, admin_address));
    ;; INVARIANTE DE SEGURIDAD ECONÓMICA:
    ;; Estrictamente prohibido si el trading está activo, graduado o en migración.
    ;; Permitido ÚNICAMENTE en STATE_INITIALIZING (bootstrap inicial previo a depósitos de usuarios).
    throw_unless(ERROR_INVALID_STATE, state == STATE_INITIALIZING);

    slice new_migration_router = in_msg_body~load_msg_addr();
    throw_if(408, new_migration_router.preload_uint(2) == 0);
    throw_if(408, equal_slices(new_migration_router, my_address()));
    throw_if(408, equal_slices(new_migration_router, lp_locker_address));
    throw_if(408, equal_slices(new_migration_router, jetton_master_address));
    throw_if(408, equal_slices(new_migration_router, curve_jetton_wallet));

    migration_router_address = new_migration_router;
    save_data(...);
    return ();
}
```

*Nota de arquitectura:* Si la curva ya recibe la dirección del Migration Router durante el mensaje `op::init_launchpad` (`0x414e4c01`), la existencia de `op::set_migration_router` es redundante. Se recomienda mantenerla restringida a `STATE_INITIALIZING` como mecanismo de ajuste pre-lanzamiento, o retirarla por completo para lograr inmutabilidad absoluta desde el despliegue del DAG.

---

## 4. SEPARACIÓN RIGUROSA DE CAPAS: CONFIGURACIÓN VS. ESTADO DESPLEGADO

En la arquitectura de TON Blockchain, la identidad de un contrato inteligente está determinada criptográficamente por su `StateInit`:
$$\text{Address} = \text{SHA256}(\text{SplitDepth} \mathbin{\Vert} \text{Special} \mathbin{\Vert} \text{CodeCell} \mathbin{\Vert} \text{DataCell} \mathbin{\Vert} \text{LibraryCell})$$

A continuación se establece la diferenciación técnica fundamental entre las cuatro capas del sistema:

| Capa | Definición y Ubicación | Mecanismo de Mutación | Impacto en la Identidad On-Chain |
| :--- | :--- | :--- | :--- |
| **1. Constantes Locales** | Variables en archivos `.fc` o constantes en scripts `.js` / `.ts` (e.g. `STONFI_TESTNET_ROUTER`). | Edición de código fuente y recompilación. | Altera el hash del bytecode compilado (`CodeCell`) si se modifica en FunC, alterando la dirección de cualquier contrato derivado. |
| **2. Datos Iniciales (`StateInit`)** | Estructura de celda `DataCell` inicial inyectada al momento del despliegue. | Configuración de parámetros iniciales en el script de despliegue. | **Cualquier cambio en los datos iniciales produce una dirección de contrato completamente distinta.** |
| **3. Estado Desplegado (`c4`)** | Almacenamiento persistente del contrato activo en la blockchain tras el despliegue. | Mensajes internos que invocan métodos modificadores autorizados (`set_data()`). | La dirección del contrato permanece inalterada; solo cambia el contenido de su memoria persistente. |
| **4. Direcciones Registradas** | Punteros a contratos externos almacenados dentro de la memoria persistente de la curva (e.g. `dex_router_address`, `migration_router_address`). | Operaciones de control on-chain (como `op::init_launchpad`). | Modifica la topología de comunicación inter-contrato sin alterar la identidad de la curva. |

### Implicaciones Técnicas Directas:
1. **¿Modificar un script cambia un contrato desplegado?**  
   **NO.** Si se actualiza la dirección `STONFI_TESTNET_ROUTER` en `deploy-launchpad-testnet.js` o en `scripts/`, los contratos que ya residen en TON testnet no sufren alteración alguna. El script generará un nuevo `StateInit` que calculará una dirección totalmente nueva para despliegues futuros.
2. **¿Puede el Migration Router actual apuntar a otro DEX sin volver a desplegarse?**  
   **NO.** En `anlgram-migration-router.fc`, `dex_router_address` se almacena directamente en la celda raíz del `DataCell` inicial (línea 63) y el contrato **no expone ningún método ni opcode para modificarlo**. Para vincular ANLGRAM a un nuevo DEX router (e.g. Candidato B), es mandatorio desplegar una nueva instancia de `anlgram-migration-router`.
3. **¿Requiere la Bonding Curve un nuevo despliegue o una llamada administrativa?**  
   Si la curva ya ha sido desplegada e inicializada mediante `op::init_launchpad`, almacena la dirección del Migration Router antiguo. Para cambiarla de forma segura:
   - En pre-lanzamiento (`STATE_INITIALIZING`): puede actualizarse mediante `op::set_migration_router`.
   - Si el trading ya comenzó: **la curva no puede ni debe aceptar cambios**; se debe desplegar un nuevo conjunto acíclico completo para el token.
4. **¿Queda afectado el LP Locker?**  
   **SÍ.** En `anlgram-lp-locker.fc`, la variable `router_address` se fija de forma irreversible durante `op::init_lp_locker` (`0x414e4c39`), pasando `is_router_initialized` a 1. Una vez fijado, rechaza cualquier reconfiguración (arrojando error 405). Además, el método `set_lp_wallet` solo puede ser llamado por ese router autorizado. Por tanto, si se sustituye el Migration Router, el LP Locker debe desplegarse como una nueva instancia o inicializarse con la dirección del nuevo Migration Router.

---

## 5. EVALUACIÓN TÉCNICA DE ROUTERS EXTERNOS EN TON TESTNET

Se evaluaron on-chain en modo de solo lectura (RPC Testnet) los candidatos a DEX Router disponibles:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TABLA COMPARATIVA ON-CHAIN                         │
├───────────────────────┬──────────────────────────┬──────────────────────────┤
│ Criterio              │ Candidato A (CPI v2.1.0) │ Candidato B (DEX v2.2)   │
├───────────────────────┼──────────────────────────┼──────────────────────────┤
│ Dirección Testnet     │ kQALh-JBBIKK7gr0o4AVf... │ kQAFpeGFJQA9KqiCxXZ8J4...│
│ Dirección Raw         │ 0:0b87e904120a2bb82bd... │ 0:05a5e18525003d2aa882...│
│ Estado en Testnet     │ active (72.58 TON)       │ active (2.10 TON)        │
│ get_router_version()  │ Falla (exit_code: 9)     │ Éxito: [2, 2, "release"] │
│ get_router_data()     │ Falla (exit_code: 9)     │ Éxito (exit_code: 0)     │
│ Bandera is_locked     │ Inaccesible              │ 0x0 (Desbloqueado/Activo)│
│ Pool Testnet Asociado │ No operacional           │ kQDe5QWFPcyZO2lJaUr-Y... │
│ Pool is_locked        │ N/A                      │ 0x0 (Desbloqueado/Activo)│
│ Historial de Txs      │ 282 fallos consecutivos  │ 396+ txs (243+ exitosas) │
│ Última Tx Exitosa     │ Enero 2026 (hace 9 meses)│ Reciente (Octubre 2026)  │
│ TL-B Provisión LP     │ cross_provide_lp_body    │ cross_provide_lp_body    │
│ Origen del Despliegue │ Desconocido / Obsoleto   │ Bug Bounty HackenProof   │
│ Veredicto Técnico     │ BLOQUEADO / NO FUNCIONAL │ COMPATIBLE Y OPERACIONAL │
└───────────────────────┴──────────────────────────┴──────────────────────────┘
```

### Hallazgos Clave sobre el Candidato B:
1. **Despliegue y Autoría:** Corresponde al contrato oficial publicado por el equipo de STON.fi en su programa oficial de auditoría en HackenProof (`https://hackenproof.com/programs/ston-dot-fi-dex-smart-contracts-v2`). No es un fork de terceros, sino una instancia oficial de STON.fi DEX v2.2.
2. **Estado de Bloqueo (`is_locked`):** Tanto el Router como su pool registrado de prueba (`kQDe5QWFPcyZO2lJaUr-Y4zmymMUSdjOHAI-E2oApdDMLI4q`) retornan `0x0` en su getter `is_locked`, confirmando que no existe suspensión administrativa ni pausa de emergencia activa.
3. **Compatibilidad de Mensajería:** Utiliza exactamente el opcode `op::provide_lp = 0x37c096df` y la estructura TL-B `cross_provide_lp_body`, perfectamente soportada por `anlgram-migration-router.fc`.
4. **Garantías en TON Testnet:** Como en toda red de pruebas (testnet), no existe un Acuerdo de Nivel de Servicio (SLA) formal. Los validadores de testnet y los desarrolladores de STON.fi pueden reiniciar el estado de la red o retirar contratos de prueba sin previo aviso. Esta es una limitación inherente al entorno de pruebas que debe gestionarse con verificaciones preflight automatizadas antes de cada sesión de pruebas.

---

## 6. ANÁLISIS DE CAPACIDADES DE `minter-contract/deploy-launchpad-testnet.js`

Se auditó de forma exhaustiva el código de `minter-contract/deploy-launchpad-testnet.js` (580 líneas) para determinar sus capacidades reales:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│             AUDITORÍA DE CAPACIDADES: deploy-launchpad-testnet.js           │
├─────────────────────────────────────────────────┬───────────┬───────────────┤
│ Capacidad Funcional                             │ Presente? │ Evidencia     │
├─────────────────────────────────────────────────┼───────────┼───────────────┤
│ Validador de configuración de red (Testnet HTTPS)│ SÍ        │ Líneas 160-200│
│ Verificación de hashes de artefactos BOC        │ SÍ        │ Líneas 205-240│
│ Detección de ciclos y ordenación topológica DAG │ SÍ        │ Líneas 245-290│
│ Consultas RPC de solo lectura a cuentas DEX     │ SÍ        │ Líneas 420-490│
│ Modo Dry-Run / Planificación visual de despliegue│ SÍ        │ Líneas 504-523│
│ Manejo o derivación de claves privadas / mnemonics│ NO        │ 0 ocurrencias │
│ Integración con TonConnect / Wallets externas   │ NO        │ 0 ocurrencias │
│ Generación de firmas criptográficas Ed25519     │ NO        │ 0 ocurrencias │
│ Envío de mensajes externos / broadcast a testnet│ NO        │ 0 ocurrencias │
│ Transacciones on-chain de despliegue            │ NO        │ 0 ocurrencias │
└─────────────────────────────────────────────────┴───────────┴───────────────┘
```

### Clasificación Formal:
`minter-contract/deploy-launchpad-testnet.js` es un **VALIDADOR DE CONFIGURACIÓN PREFLIGHT Y PLANIFICADOR DE GRAFO (DAG)**.  
**NO es un script de despliegue ejecutable.**  
El script aborta explícitamente cualquier operación si detecta flags transaccionales y concluye textualmente:
> *"This script cannot deploy contracts. A separately reviewed execution tool is required after all protocol and StateInit dependencies are resolved."* (Líneas 552-553).

Por tanto, para la Fase 3C.1 es mandatorio diseñar y construir la herramienta de ejecución de despliegue supervisada (`deploy-launchpad-testnet-exec.js`).

---

## 7. MATRIZ DE RIESGOS Y MITIGACIONES

| Identificador | Descripción del Riesgo | Nivel de Severidad | Probabilidad | Medida de Mitigación Requerida | Estado de Mitigación |
| :--- | :--- | :---: | :---: | :--- | :---: |
| **RSK-01** | **Rug-pull vía `op::set_migration_router`:** Admin redirige 500 TON y 200M tokens en `STATE_GRADUATION_PENDING`. | **CRÍTICO** | Media | Restringir el opcode a `STATE_INITIALIZING` o eliminarlo. | **PENDIENTE (Motivo de REQUIERE CORRECCIONES)** |
| **RSK-02** | **Caducidad o reseteo de Candidate B:** El router DEX de testnet es retirado o pausado por STON.fi. | **ALTO** | Baja / Media | Verificación preflight obligatoria en vivo (`get_router_data`, `is_locked == 0`) antes de cada prueba. | **DOCUMENTADO Y PROBADO** |
| **RSK-03** | **Falta de liquidez en pTON Testnet:** Insuficiente pTON para aparear liquidez en el pool. | **MEDIO** | Media | Financiamiento previo de la wallet del desplegador con TON para mintear pTON de prueba. | **PLANIFICADO PARA 3C.1** |
| **RSK-04** | **Ejecución precipitada sin script validado:** Intentar despliegue con `deploy-launchpad-testnet.js`. | **ALTO** | Nula | El script actual falla preventivamente si se le piden transacciones; se construirá un script dedicado. | **RESUELTO POR DISEÑO** |
| **RSK-05** | **Desincronización de direcciones en LP Locker:** Router no coincide con el registrado en el Locker. | **ALTO** | Baja | Topología acíclica estricta: desplegar Minter $\to$ Curve $\to$ Locker $\to$ Migration Router en orden DAG. | **RESUELTO Y PROBADO (TVM)** |
| **RSK-06** | **Drenaje de gas por swaps fallidos:** La curva pierde reservas al subsidiar gas de reembolsos. | **CRÍTICO** | Nula | Mecanismo anti-drain remediado en Fase 2C: el usuario financia su propio gas o se registra en diccionario. | **RESUELTO Y PROBADO (TVM)** |

---

## 8. PRÓXIMOS PASOS RECOMENDADOS PARA LA FASE DE PREPARACIÓN DEL DESPLIEGUE

Para avanzar de forma ordenada y segura hacia el despliegue supervisado en TON Testnet, se deben ejecutar los siguientes pasos en la fase subsiguiente:

1. **Aplicar la Corrección de Seguridad de `op::set_migration_router`:**
   - Modificar la línea 773 de `minter-contract/contracts/anlgram-bonding-curve.fc` para restringir el opcode a `throw_unless(ERROR_INVALID_STATE, state == STATE_INITIALIZING);`.
   - Recompilar `anlgram-bonding-curve.fc` con `@ton-community/func-js` y actualizar su artefacto `.compiled.json`.
   - Adaptar las aserciones de Suite 6 en `test-bonding-curve-tvm.js` para certificar el rechazo con código 407 ante intentos de reconfiguración en estados activos o fallidos.
2. **Actualizar la Configuración de Router DEX:**
   - Sustituir la dirección de Candidate A por la de Candidate B (`kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn`) en los archivos de configuración de despliegue para testnet.
3. **Construir el Script de Despliegue Supervisado (Phase 3C.1):**
   - Crear `minter-contract/deploy-launchpad-testnet-exec.js` con:
     - Carga segura de mnemónicos desde variables de entorno locales (sin almacenamiento en disco).
     - Comprobación previa de balance (mínimo ~3.5 TON testnet).
     - Despliegue secuencial ordenado según el DAG verificado: Minter $\to$ Curve $\to$ Locker $\to$ Migration Router.
     - Ejecución de mensajes de inicialización post-despliegue (`init_lp_locker`, `init_launchpad`).
     - Minteo inicial de 1B tokens hacia la curva y renuncia verificada on-chain (`op == 3` con `custom_recipient = Curve`).
4. **Ejecutar Ensayo de Despliegue Supervisado en Testnet:**
   - Transmitir la secuencia de despliegue con monitorización en tiempo real vía TonCenter/TonAPI explorer.

---

## DECISIÓN FINAL DE LA COMPUERTA

```
═══════════════════════════════════════════════════════════════════════════
                      DICTAMEN OFICIAL: REQUIERE CORRECCIONES
═══════════════════════════════════════════════════════════════════════════

Fundamentación Técnica:
La preparación técnica general es extraordinariamente sólida y viable:
los contratos superan 325 pruebas unitarias locales y existe un router
DEX externo activo y verificado en TON testnet (Candidate B, STON.fi v2.2).

Sin embargo, el criterio mandatario de seguridad económica (Criterio 3)
no se cumple en el commit e70c565 debido a que 'op::set_migration_router'
permite a un administrador alterar el destino de los fondos tras la
graduación (vector de rug-pull sobre 500 TON y 200M tokens).

Asimismo, el script de despliegue disponible es exclusivamente un validador
preflight y no cuenta con funciones de emisión transaccional.

Por consiguiente, se dictamina REQUIERE CORRECCIONES. Una vez aplicada la
restricción de 'op::set_migration_router' a STATE_INITIALIZING y elaborado
el script ejecutor supervisado, el sistema estará plenamente calificado
para el despliegue en TON Testnet.
═══════════════════════════════════════════════════════════════════════════
```
