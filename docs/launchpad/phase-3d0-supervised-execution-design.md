# ANLGRAM MemeLabs — Informe de Fase 3D.0: Diseño y Preparación de Ejecución Supervisada en TON Testnet

**Fecha:** 29 de octubre de 2026  
**Rama:** `feature/launchpad-phase3d0`  
**Commit Base:** `6ef1289` (`feat(launchpad): phase 3c.3 read-only on-chain preflight, test reconciliation, and audit report`)  
**Entorno de Trabajo:** Git Worktree aislado (`E:\anlgram-phase3d0`)  
**Módulos Evaluados:**  
- `minter-contract/supervised-execution-engine.js` (Nuevo motor de aprobación y validación supervisada)  
- `minter-contract/deploy-launchpad-testnet-exec.js` (Ejecutor preflight e integrador CLI)  
- `minter-contract/test-supervised-execution-engine.js` (Suite de 22 pruebas unitarias de seguridad de ejecución)  

---

## 1. Resumen Ejecutivo y Dictamen Oficial

En cumplimiento estricto del mandato de la Fase 3D.0, se ha diseñado, implementado y verificado localmente el mecanismo de despliegue y configuración supervisado paso a paso para los contratos del launchpad en TON Testnet.

### Principios de Seguridad Aplicados
1. **Cero Custodia de Claves:** Ningún script, herramienta CLI, objeto en memoria ni log solicita, almacena, lee o procesa frases semilla, claves privadas ni algoritmos de firma propios. Toda firma criptográfica se delega exclusivamente a la billetera externa del operador mediante el protocolo abierto TON Connect 2.0.
2. **Aprobación Humana Unitaria (No Batching):** Cada una de las 8 operaciones (4 despliegues StateInit y 4 inicializaciones bootstrap) es presentada como una transacción aislada de exactamente un mensaje (`messages.length === 1`). Se prohíbe taxativamente el empaquetado de múltiples operaciones irreversibles en una transacción opaca.
3. **Aislamiento Criptográfico de Red:** Se valida de forma determinista que el identificador global de red sea estrictamente `TON_GLOBAL_ID = -3` y la cadena `chain = -3` (`CHAIN.TESTNET`). Se rechaza de forma inmediata e incondicional cualquier conexión de Mainnet (`chain = -239`) o redes desconocidas.
4. **Cero Transmisión Real en Fase 3D.0:** Esta fase prepara y prueba exhaustivamente el procedimiento técnico en entorno simulado y unitario. **No se han desplegado contratos, no se han solicitado firmas reales y no se han transmitido transacciones on-chain.**
5. **No Publicación en Producción ni Túneles Improvisados:** No se ha desplegado ninguna interfaz en la web productiva ni se han abierto túneles públicos inseguros (tipo ngrok o localtunnel) para sortear restricciones.

```
═══════════════════════════════════════════════════════════════════════════
DICTAMEN OFICIAL FASE 3D.0: BLOQUEADO
═══════════════════════════════════════════════════════════════════════════
```

### Justificación Ineludible del Dictamen `BLOQUEADO`
El procedimiento técnico se encuentra 100% diseñado y probado satisfactoriamente con 301 pruebas locales superadas. Sin embargo, el dictamen final operativo para la ejecución real es formalmente **`BLOQUEADO`** debido a dos condiciones objetivas insoslayables:
1. **Ausencia de Manifiesto HTTPS de TON Connect Alojado:** El protocolo TON Connect 2.0 y las billeteras oficiales (Tonkeeper Testnet, OpenMask, Tonhub) exigen que el archivo `tonconnect-manifest.json` esté alojado en un dominio público bajo HTTPS (`https://...`). Las billeteras móviles rechazan taxativamente orígenes `http://localhost` o dominios privados. De acuerdo con las directivas de seguridad de la Fase 3D.0, **no se permite publicar en producción ni crear túneles improvisados para eludir esta limitación**. Por consiguiente, la conexión de billeteras móviles permanece bloqueada hasta que exista un entorno de staging con HTTPS aprobado.
2. **Saldo Cero de la Billetera Operadora:** La dirección de despliegue configurada (`kQBzQx6SZa94aoiJFfaHPV-cJ1EV-Y74djNEKwv1Z5GOn06-`) cuenta con un balance en testnet de **0.0000 TON**. El presupuesto de seguridad exige un mínimo de **2.71 TON** y recomienda **3.50 TON** antes de habilitar la primera firma.

---

## 2. Estado del Repositorio y Entorno de Trabajo

- **Worktree Aislado:** `E:\anlgram-phase3d0`, desvinculado de la rama `main` y de las ramas productivas.
- **Rama:** `feature/launchpad-phase3d0`.
- **HEAD Base:** `6ef1289` (`feat(launchpad): phase 3c.3 read-only on-chain preflight, test reconciliation, and audit report`).
- **Integridad de Producción:** Cero modificaciones a `main`, cero operaciones de `git push` o `git merge`. Los archivos de la web pública (`index.html`, creador de jettons en producción) permanecen 100% inalterados.

---

## 3. Arquitectura del Mecanismo de Firma (TON Connect 2.0)

### 3.1. Delegación de Custodia y Flujo de Interacción
La arquitectura desacopla totalmente la lógica de despliegue de las claves criptográficas:

```
┌─────────────────────────┐          ┌──────────────────────────┐          ┌─────────────────────────┐
│ Herramienta de Despliegue│          │ Puente TON Connect 2.0   │          │ Billetera del Usuario   │
│ CLI / Local Engine      │          │ (Bridge HTTPS / SSE)     │          │ (Tonkeeper / Hardware)  │
└────────────┬────────────┘          └────────────┬─────────────┘          └────────────┬────────────┘
             │                                    │                                     │
             │ 1. Solicita Conexión (Testnet)     │                                     │
             │───────────────────────────────────>│                                     │
             │                                    │ 2. Escaneo QR / Deep Link           │
             │                                    │────────────────────────────────────>│
             │                                    │                                     │
             │                                    │ 3. Valida Chain == -3               │
             │                                    │    (Rechaza si Chain == -239)       │
             │                                    │<────────────────────────────────────│
             │ 4. Confirma Conexión (Address)     │                                     │
             │<───────────────────────────────────│                                     │
             │                                                                          │
             │ [ VERIFICACIÓN PREFLIGHT SOLO LECTURA EN TON TESTNET ]                   │
             │ - Valida saldo >= 2.71 TON                                               │
             │ - Valida Estado de Cuenta (UNINITIALIZED para Deploy, ACTIVE para Call)  │
             │ - Valida Hash de Artefacto y StateInit                                   │
             │                                                                          │
             │ 5. Muestra Ficha de Aprobación al Operador (Terminal / UI)               │
             │    (Destino, Importe, StateInit, Payload, Riesgos Irreversibles)         │
             │                                                                          │
             │ 6. Operador autoriza ('CONFIRM')                                         │
             │                                                                          │
             │ 7. Envía 1 Mensaje (sendTransaction)                                     │
             │───────────────────────────────────>│                                     │
             │                                    │ 8. Muestra Detalles en Pantalla     │
             │                                    │────────────────────────────────────>│
             │                                    │                                     │
             │                                    │ 9. Firma Local con Clave Privada    │
             │                                    │    (o Cancelación por el Usuario)   │
             │                                    │<────────────────────────────────────│
             │ 10. Retorna BOC / Tx Hash          │                                     │
             │<───────────────────────────────────│                                     │
             │                                                                          │
             │ [ RECONCILIACIÓN Y VERIFICACIÓN POST-TRANSACCIÓN ON-CHAIN ]              │
             │ - Polling de estado on-chain (TonAPI / Toncenter)                        │
             │ - Valida exit_code == 0 (Sin rebotes)                                    │
             │ - Ejecuta Getters del contrato para verificar transición de estado       │
             │ - Habilita siguiente paso SOLO tras verificación 100% exitosa            │
             ▼                                                                          ▼
```

### 3.2. Formato del Mensaje TON Connect (`sendTransaction`)
Cada transacción enviada al puente TON Connect contiene exactamente un mensaje en el array `messages`:

```json
{
  "validUntil": 1793400000,
  "network": "-3",
  "from": "kQBzQx6SZa94aoiJFfaHPV-cJ1EV-Y74djNEKwv1Z5GOn06-",
  "messages": [
    {
      "address": "kQCUd7-PNHWoT2uihm-DGhHtUxLgwxX-ngdc9-P7g_pV0nV8",
      "amount": "80000000",
      "stateInit": "te6cckEBAQEAAgAAAE...",
      "payload": null
    }
  ]
}
```

### 3.3. Ficha de Aprobación Humana Unitaria (Card)
Antes de pedir consentimiento al usuario, la herramienta presenta en pantalla la ficha estructurada:

```
═══════════════════════════════════════════════════════════════════════════
📋 OPERACIÓN 1 DE 8: DEPLOY LAUNCHPAD JETTON MASTER
═══════════════════════════════════════════════════════════════════════════

  Contrato:            Launchpad Jetton Master
  Tipo de Operación:   DEPLOY_STATEINIT
  Dirección Destino:   kQCUd7-PNHWoT2uihm-DGhHtUxLgwxX-ngdc9-P7g_pV0nV8
  Dirección Raw:       0:9477bf8f3475a84f6ba2866f831a11ed5312e0c315fe9e075cf7e3fb83fa55d2
  Importe Propuesto:   0.08 TON (80,000,000 nanoTON)
  Hash Código TVM:     90b5069f199fcea56ef467dd25cf8420c5e9848ba0fcc0cc139424c5cac17aec
  StateInit BOC:       Presente (Base64)

--- Contexto de Ejecución ---
  Billetera Operadora: kQBzQx6SZa94aoiJFfaHPV-cJ1EV-Y74djNEKwv1Z5GOn06-
  Red de Destino:      TON Testnet (global_id: -3, chain: -3)
  Saldo Mínimo Total:  2.71 TON (Reserva Operativa: 1.50 TON)
  Saldo Actual Wallet: 3.5000 TON

--- Precondiciones Verificadas On-Chain ---
  Estado Requerido:    UNINITIALIZED (nonexist o uninitialized con 0 bytes de código)
  Detalle:             La cuenta debe estar completamente libre para recibir StateInit.

--- Efectos Irreversibles y Riesgos ---
  ⚠️  Reserva permanente de la dirección determinista del Master en TON testnet.
  ⚠️  Inicializa el total_supply en 0 y vincula al deployer como administrador temporal.

───────────────────────────────────────────────────────────────────────────
  ACCIONES DE APROBACIÓN:
  [1] APROBAR: Transmitir solicitud a la billetera externa conectada.
  [2] CANCELAR: Abortar el procedimiento de inmediato sin emitir ninguna transacción.
═══════════════════════════════════════════════════════════════════════════
```

---

## 4. Plan Detallado de Operaciones y Grafo de Dependencias

El procedimiento se organiza en 8 pasos secuenciales estrictos. Cada paso exige la verificación on-chain previa de los pasos anteriores.

```
[Op 1: Deploy Minter] ──> [Op 2: Deploy Curve] ──> [Op 3: Deploy Locker] ──> [Op 4: Deploy Migrator]
                                │                           │                          │
                                │                           ▼                          │
                                │                  [Op 5: Init LP Locker] <────────────┘
                                │                           │
                                ▼                           ▼
                       [Op 6: Init Launchpad (Curve)] <─────┘
                                │
                                ▼
                       [Op 7: Mint 1B & Renounce Admin]
                                │
                                ▼
                       [Op 8: Verify Renounce & Activate Curve]
```

### Tabla Resumen de las 8 Operaciones

| Paso | Identificador | Nombre de Operación | Contrato Destino | Tipo | Importe TON | Opcode / Payload | Precondición On-Chain | Criterio de Verificación Post-Transacción |
|:---:|---|---|---|:---:|:---:|---|---|---|
| **1** | `OP_1_DEPLOY_MINTER` | Despliegue Jetton Master | Launchpad Minter | `DEPLOY_STATEINIT` | 0.08 TON | N/A (StateInit) | Cuenta destino `UNINITIALIZED` | Cuenta `active`, `code_hash` verificado, `total_supply == 0` |
| **2** | `OP_2_DEPLOY_CURVE` | Despliegue Bonding Curve | Bonding Curve | `DEPLOY_STATEINIT` | 0.15 TON | N/A (StateInit) | Cuenta destino `UNINITIALIZED`, Op 1 activa | Cuenta `active`, getter `get_curve_state` devuelve `0` (`STATE_UNINITIALIZED`) |
| **3** | `OP_3_DEPLOY_LOCKER` | Despliegue LP Locker | LP Locker | `DEPLOY_STATEINIT` | 0.10 TON | N/A (StateInit) | Cuenta destino `UNINITIALIZED`, Op 2 activa | Cuenta `active`, getter `is_permanently_locked` devuelve `0`, lock hasta `0xFFFFFFFFFFFFFFFF` |
| **4** | `OP_4_DEPLOY_MIGRATOR` | Despliegue Migration Router | Migration Router | `DEPLOY_STATEINIT` | 0.12 TON | N/A (StateInit) | Cuenta destino `UNINITIALIZED`, Ops 1-3 activas | Cuenta `active`, vinculada a STON.fi DEX v2.2 y pTON v2 Master |
| **5** | `OP_5_INIT_LP_LOCKER` | Inicialización LP Locker | LP Locker | `CONTRACT_CALL` | 0.05 TON | `0x414e4c39` (`op::init_lp_locker`) + router address | LP Locker `active`, `is_router_initialized == 0`, Router `active` | Getter `is_router_initialized` devuelve `1` |
| **6** | `OP_6_INIT_LAUNCHPAD` | Inicialización Launchpad | Bonding Curve | `CONTRACT_CALL` | 0.06 TON | `0x414e4c01` (`op::init_launchpad`) + ref(Minter, Router, Locker, Migrator, WalletCode) | Curve en `STATE_UNINITIALIZED` (0), Op 5 verificada | Getter `get_curve_state` devuelve `1` (`STATE_INITIALIZING`) |
| **7** | `OP_7_MINT_AND_RENOUNCE` | Emisión 1B y Renuncia Admin | Jetton Master | `CONTRACT_CALL` | 0.10 TON | `op::mint` (1B a Curve) y `op == 3` (change_admin a `addr_none` con recipient Curve) | Curve en `STATE_INITIALIZING` (1), admin del Minter es el operador | Admin del Minter es `addr_none` (permanente), Curve recibe notificación |
| **8** | `OP_8_ACTIVATE_CURVE` | Verificación Renuncia y Activación | Bonding Curve | `ONCHAIN_VERIFICATION` | 0.05 TON | `op::check_renounce` (si se requiere sondeo) | Minter admin es `addr_none`, notificación recibida por Curve | Getter `get_curve_state` devuelve `3` (`STATE_ACTIVE`). Trading público activado. |

---

## 5. Cálculo Determinista de Direcciones y Parámetros

Las direcciones de los 4 contratos se calculan de manera determinista a partir de los StateInit puros (Bytecode BOC + Data Cell) y de la dirección de la billetera operadora:

$$\text{Address} = \text{contractAddress}\big(\text{workchain}=0, \{\text{code}: \text{codeCell}, \text{data}: \text{dataCell}\}\big)$$

### Tabla de Direcciones y Hashes Deterministas Aprobados

| Contrato | Dirección Testnet Friendly | Dirección Raw (Workchain 0) | Hash SHA256 del Bytecode BOC | Hash de la Celda de Código TVM |
|---|---|---|---|---|
| **Launchpad Jetton Master** | `kQCUd7-PNHWoT2uihm-DGhHtUxLgwxX-ngdc9-P7g_pV0nV8` | `0:9477bf8f3475a84f6ba2866f831a11ed5312e0c315fe9e075cf7e3fb83fa55d2` | `92b25bfa090b89cdb453f50ae268c53dbae87ffffdb7e15b99e9bc9396ef2a00` | `90b5069f199fcea56ef467dd25cf8420c5e9848ba0fcc0cc139424c5cac17aec` |
| **Bonding Curve** | `kQCI_yYs83HPyPrL6HQVTyeY3AOG3zzovN1JAAjfcWgNLvzm` | `0:88ff262cf371cfc8facbe874154f2798dc0386df3ce8bcd490008df71680d2ef` | `f9d62f52d4ccb71fd95d93d9fe57d961e37165159e456b55aa0c9a9a48f12797` | `dae0ca19cd71c54fd4bbf90e545f1de38c66bc5de7ad5bdc37eaa8dd8ea62eae` |
| **LP Locker** | `kQBqMWD-mAjFIhN4RfUayVSYfJOeDiemRNQIlyo8Xtx5xjeH` | `0:aa3160fe9808c522137845f51ac954987c939e0e27a644d408972a3c5edc79c6` | `36ac2eaf0c360eb795984a4a0d7d94eaf6d9e2f3fe37178cc7285c90901dcb6a` | `e9da326d9ad2ec259112743a2e581fc5783693e9ee2d7371e5ff249bcaf97536` |
| **Migration Router** | `kQDS4rD_RbXYRjT_6HXFOUwA2KfyAgi5NVM6GdYLRXskoI3L` | `0:d2e2b0ff45b5d84634ffe875c5394c00d8a7f20208b935533a19d60b457b24a0` | `35c57ebf83cb11dd2c7b6801437ba5d25efdae8912accaea632210071dda2139` | `ad789269bb790232a0fcb7a4c711099e295496298db9b1fdeaac65ada26ef844` |
| **Billetera Operadora (Deployer)** | `kQBzQx6SZa94aoiJFfaHPV-cJ1EV-Y74djNEKwv1Z5GOn06-` | `0:73431e9265af786a888915f6873d5f9c275115f98ef87633442b0bf567918e9f` | N/A (Wallet V4R2) | N/A |
| **STON.fi Router v2.2 (Candidate B)** | `kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn` | `0:05a5e18525003d2aa882c5767c27897ffef4980311528ab48ebcf1e7e92497e3` | N/A (Release DEX) | N/A |
| **pTON v2 Master** | `kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px` | `0:0092df40d7a1443b35f0293efce1ede066499f4be32809fa590d5ad6daf13413` | N/A (Release pTON) | N/A |

> **Comprobación de Cambio de Billetera:** Si la billetera conectada vía TON Connect difiere de la billetera operadora configurada, el motor detecta la divergencia y recalcula inmediatamente todas las direcciones deterministas antes de permitir cualquier operación.

---

## 6. Presupuesto, Gas y Protección Estricta de Fondos

### 6.1. Desglose Detallado de Costes Operativos del Deployer

```
┌─────────────────────────────────────────────────────────────┬──────────────┬──────────────────────────────────────────┐
│ Operación                                                   │ Coste (TON)  │ Destino del Gas / Storage                │
├─────────────────────────────────────────────────────────────┼──────────────┼──────────────────────────────────────────┤
│ 1. Deploy Launchpad Jetton Master                           │ 0.08 TON     │ StateInit + Storage rent inicial         │
│ 2. Deploy Bonding Curve                                     │ 0.15 TON     │ StateInit + Storage rent reservas AMM    │
│ 3. Deploy LP Locker                                         │ 0.10 TON     │ StateInit + Storage rent bloqueo         │
│ 4. Deploy Migration Router                                  │ 0.12 TON     │ StateInit + Storage rent enrutamiento    │
│ 5. Bootstrap 1: Init LP Locker (0x414e4c39)                 │ 0.05 TON     │ Ejecución TVM y almacenamiento de router │
│ 6. Bootstrap 2: Init Launchpad (0x414e4c01)                 │ 0.06 TON     │ Ejecución TVM y transición a STATE_INIT  │
│ 7. Bootstrap 3: Mint 1B Tokens & Renounce Admin             │ 0.10 TON     │ Transferencia de tokens + cambio admin   │
│ 8. Bootstrap 4: Verify Admin Renounce & Activate            │ 0.05 TON     │ Verificación y activación STATE_ACTIVE   │
├─────────────────────────────────────────────────────────────┼──────────────┼──────────────────────────────────────────┤
│ SUMA GASTOS TRANSACCIONALES (8 OPERACIONES)                 │ 0.71 TON     │ Fondos consumidos en gas y rent          │
│ Reserva Operativa de Seguridad (Volatilidad y Storage)      │ 1.50 TON     │ Permanece en la billetera operadora      │
│ Margen de Provisión y Resincronización                      │ 0.50 TON     │ Margen para reintentos supervisados      │
├─────────────────────────────────────────────────────────────┼──────────────┼──────────────────────────────────────────┤
│ SALDO MÍNIMO EXIGIDO (HARD FLOOR)                           │ 2.71 TON     │ Bloqueo automático si balance < 2.71 TON │
│ SALDO RECOMENDADO PARA SESIÓN INTERACTIVA                   │ 3.50 TON     │ Margen óptimo para ejecución fluida      │
└─────────────────────────────────────────────────────────────┴──────────────┴──────────────────────────────────────────┘
```

### 6.2. Invariante Financiero: Separación entre Gas y Liquidez de Graduación

Es imperativo recalcar la distinción fundamental entre los fondos:

1. **Gas del Deployer (0.71 TON + 1.50 TON reserva):**  
   Proviene exclusivamente de la billetera operadora del desarrollador. Cubre la creación de contratos y el bootstrap.
2. **TON Recaudado en la Curva:**  
   Los fondos acumulados durante el trading en la curva provienen de los compradores minoristas.
3. **500 TON de Liquidez para Graduación en STON.fi:**  
   Se acumulan de forma orgánica y matemáticamente exacta mediante la venta de los 800 millones de tokens a lo largo de la curva bonding. **El deployer NUNCA subsidia ni aporta los 500 TON de liquidez.**
4. **200 Millones de Tokens Escrow:**  
   Permanecen custodiados en la Bonding Curve desde el inicio hasta la graduación, momento en el cual se transfieren al Migration Router junto con los 500 TON para emparejarse en STON.fi DEX v2.2.

---

## 7. Manejo de Fallos, Rebotes, Timeouts y Estados Indeterminados

El motor de ejecución implementa la política *Fail-Closed* ante cualquier contingencia:

1. **Rechazo de Firma por el Usuario:**  
   Si el usuario presiona "Rechazar" en la billetera, la promesa de TON Connect arroja un error (`UserRejectsError`). La herramienta marca `USER_REJECTED`, detiene el procedimiento de inmediato y no reintenta.
2. **Timeout en Transmisión o Consulta:**  
   Si la red se congestiona o la transacción tarda en confirmarse, la herramienta marca `INDETERMINATE_TIMEOUT`. **Está estrictamente prohibido el reenvío automático.** La herramienta exige que el operador ejecute una comprobación manual de solo lectura (`--verify-onchain`) para reconciliar el estado antes de permitir cualquier reintento.
3. **Transacción Rebotada (Bounced) o Exit Code != 0:**  
   Si la transacción falla en la fase de acción o la TVM arroja una excepción (ej. código 408, 401, 73), la cuenta se mantiene en el estado previo. La herramienta detecta el rebote, marca `TRANSACTION_FAILED_BOUNCED` y **bloquea todas las operaciones posteriores**.
4. **Prevención de Operaciones Posteriores (DAG Halt):**  
   El motor valida el historial de pasos completados (`completedStepIds`). Una operación no puede mostrarse para firma si sus dependencias directas no han sido verificadas exitosamente on-chain.
5. **Rate Limiting (HTTP 429):**  
   Si un endpoint público devuelve HTTP 429, el preflight clasifica la respuesta como `INDETERMINATE` y detiene la ejecución. Nunca asume que un fallo de red significa cuenta libre o lista.
6. **Sanitización de Logs:**  
   La función `sanitizeLogOutput` intercepta toda salida de texto y sustituye automáticamente frases mnemónicas (12/24 palabras), semillas y claves privadas de 64 caracteres hex por `[REDACTED_MNEMONIC]` y `[REDACTED_HEX_KEY]`.

---

## 8. Resultados de las Pruebas Locales y Regresiones

Se ejecutaron las 7 suites completas de pruebas unitarias, de simulación TVM y de integración en el worktree aislado `E:\anlgram-phase3d0`.

### Tabla Consolidada de Pruebas (301 Pruebas Pasadas, 0 Fallos)

| Suite de Pruebas | Archivo de Prueba | Pruebas | Éxito | Estado | Cobertura Funcional |
|---|---|:---:|:---:|:---:|---|
| **Motor de Ejecución Supervisada (Phase 3D.0)** | `minter-contract/test-supervised-execution-engine.js` | 22 | 22 | **PASADA (100%)** | Rechazo de mainnet en TON Connect, detección de cambio de wallet y recálculo de StateInit, comprobación de precondiciones on-chain, detección de cuenta ocupada, detección de inicialización repetida, balance insuficiente, fallo en HTTP 429, rechazo de firma por usuario, manejo de rebotes, DAG halt ante fallos, sanitización de secretos en logs, aislamiento de 1 mensaje por transacción. |
| **Preflight On-Chain y Seguridad del Ejecutor** | `minter-contract/test-deploy-launchpad-testnet-exec.js` | 34 | 34 | **PASADA (100%)** | Preflight solo lectura, validación CRC16 de direcciones, compatibilidad Candidate B (STON.fi v2.2), fail-closed ante timeouts y errores HTTP 500/429. |
| **Simulación TVM Contratos** | `test-bonding-curve-tvm.js` | 154 | 154 | **PASADA (100%)** | Ejecución real en TVM de minter renounce, LP locker anti-front-running lock, AMM math, anti-drain, abort flow, migración STON.fi v2.2, inmutabilidad de router. |
| **Candidatos de Router DEX** | `test-router-candidates-tvm.js` | 11 | 11 | **PASADA (100%)** | Reproducción de fallo de Candidato A (CPI v2.1.0), compatibilidad estricta de Candidato B (DEX v2.2), incompatibilidad de Candidato C (v1). |
| **Matemáticas Curva AMM** | `minter-contract/test-bonding-curve-math.js` | 46 | 46 | **PASADA (100%)** | Fórmulas de producto constante, solvencia de reservas, tarifas 1%, graduación a 500 TON, 12,000 iteraciones de fuzzing aleatorio. |
| **Proveedor Blockchain** | `test-blockchain-provider.js` | 25 | 25 | **PASADA (100%)** | Failover automático TonAPI/Toncenter, manejo de 429, aislamiento de red. |
| **Validación Preflight Despliegue** | `minter-contract/test-deploy-launchpad-testnet.js` | 9 | 9 | **PASADA (100%)** | Parsing de flags preflight, rechazo mainnet, validación CRC16 de direcciones, DAG sin ciclos, conversión de nanotons. |
| **TOTAL GENERAL** | **7 Suites de Prueba** | **301** | **301** | **100% ÉXITO** | **Verificación completa de lógica de ejecución supervisada, seguridad y contratos.** |

---

## 9. Limitaciones Pendientes y Bloqueos Identificados

1. **Alojamiento Seguro de Manifiesto TON Connect (`tonconnect-manifest.json`):**  
   Para que una billetera móvil (Tonkeeper, etc.) acepte emparejarse, el manifiesto debe estar publicado en un servidor web con certificado HTTPS válido. Actualmente no existe dicho entorno para la herramienta de despliegue. **Este punto permanece bloqueado.**
2. **Aprovisionamiento Financiero de la Billetera Operadora:**  
   La dirección `kQBzQx6SZa94aoiJFfaHPV-cJ1EV-Y74djNEKwv1Z5GOn06-` tiene saldo 0.0000 TON en testnet. Se requiere fondearla con al menos 3.50 TON desde el faucet de testnet (`@testgiver_ton_bot`).
3. **Disponibilidad de API Key de Testnet:**  
   Para evitar respuestas HTTP 429 durante el sondeo interactivo entre transacciones, se recomienda suministrar `TONCENTER_API_KEY` o `TONAPI_KEY`.

---

## 10. Lista de Verificación Previa para la Primera Transacción Real

Antes de que se autorice la primera transacción on-chain en una sesión futura, se debe verificar rigurosamente:

- [ ] **1. Manifiesto Aprobado:** Manifiesto TON Connect desplegado en URL HTTPS oficial (sin túneles improvisados).
- [ ] **2. Fondeo Confirmado:** Billetera operadora con saldo >= 3.50 TON en TON Testnet.
- [ ] **3. Preflight On-Chain Limpio:** Ejecución de `--verify-onchain` con resultado `PREFLIGHT_PASS_READONLY` (las 4 direcciones `uninitialized`).
- [ ] **4. Red Verificada:** Billetera conectada exclusivamente a TON Testnet (`chain: -3`).
- [ ] **5. Aprobación Humana Explícita:** Revisión visual y consentimiento manual del operador para la Operación 1 (Deploy Launchpad Jetton Master).
- [ ] **6. Verificación Post-Paso 1:** Confirmar estado `active` y `total_supply == 0` antes de solicitar la firma de la Operación 2.

---

## 11. Conclusión y Dictamen

El mecanismo de ejecución supervisada mediante TON Connect 2.0 y aprobación humana unitaria ha quedado completamente especificado, desarrollado y probado con 301 pruebas exitosas sin registrar ninguna vulnerabilidad ni regresión.

De conformidad estricta con las condiciones del sistema y las limitaciones externas (manifiesto HTTPS pendiente y saldo actual de 0 TON):

```
═══════════════════════════════════════════════════════════════════════════
ESTADO OFICIAL DE LA FASE 3D.0: BLOQUEADO
(Requiere aprovisionamiento de fondos en testnet y alojamiento HTTPS
del manifiesto de TON Connect antes de permitir la sesión de despliegue).
═══════════════════════════════════════════════════════════════════════════
```
