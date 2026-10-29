# INFORME DE AUDITORÍA TÉCNICA INDEPENDIENTE: INTEGRACIÓN STON.FI V2.1
## Plataforma ANLGRAM MemeLabs — Módulo de Migración DEX y Custodia LP

- **Rol**: Auditor Técnico Independiente de Smart Contracts y Protocolos DeFi en TON
- **Fecha de Auditoría**: 2026-10-28T20:30:00-04:00
- **Rama de Trabajo**: `audit/stonfi-v2-independent` (Worktree aislado basado en `feature/launchpad-engine` @ commit `06a1cad`)
- **Archivos Auditados**:
  - `minter-contract/contracts/anlgram-migration-router.fc`
  - `minter-contract/contracts/anlgram-lp-locker.fc`
  - `minter-contract/contracts/anlgram-bonding-curve.fc`
  - `minter-contract/contracts/jetton-wallet.fc`
- **Contratos DEX de Referencia (STON.fi v2.1 Testnet)**:
  - Router CPI v2.1: `kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v` (`0:0b87e24104828aee0af4a380157fd2599c4b059dda8ed2a4c2c93f83fb206c5a`)
  - pTON Minter v2.1: `kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px` (`0:024b7d03368510ecd7c0a4fbf387b78199267d2f8ca027e964356b5b6bc4d04f`)
- **Estado Final de la Auditoría**: **`BLOQUEADO`**

---

## 1. RESUMEN EJECUTIVO Y DICTAMEN

Se ha llevado a cabo una auditoría técnica profunda e independiente de la integración del protocolo STON.fi v2.1, el enrutamiento de liquidez y el mecanismo de custodia de tokens de proveedor de liquidez (LP) implementados en el launchpad de memecoins ANLGRAM MemeLabs.

La auditoría analizó la mecánica de ejecución a nivel de bytecode TVM, la conformidad con el estándar TEP-74 (Jettons), los esquemas de serialización TL-B de STON.fi v2.1 y pTON v2.1, la gestión de gas, el tratamiento de fallos/rebotes y el estado on-chain de los contratos desplegados en la red de pruebas de TON (Testnet).

### DICTAMEN: `BLOQUEADO`

El diseño actual de migración a STON.fi **NO PUEDE FUNCIONAR EN TESTNET NI EN PRODUCCIÓN**. Presenta **tres defectos críticos arquitectónicos que garantizan el bloqueo permanente de fondos y la imposibilidad de graduar la curva**, junto con un **estado defectuoso on-chain del contrato Router de STON.fi en Testnet**:

1. **Deadlock de Ejecución (Invocación imposible)**: `anlgram-migration-router.fc` restringe la provisión de liquidez (`op::execute_dex_provision` = `0x414e4c37`) estrictamente a `sender_address == curve_address`. Sin embargo, `anlgram-bonding-curve.fc` no contiene código, mensaje ni función que invoque este opcode. Ningún administrador ni bot externo puede llamarlo (error 401). El proceso de graduación se congela indefinidamente con 500 TON y 200M tokens atrapados.
2. **Dependencia Circular Excluyente en `LP Locker`**: `anlgram-lp-locker.fc` almacena un único `authorized_caller`. Si es el `migration_router`, este puede configurar la wallet LP pero la confirmación de bloqueo (`op::lp_locked_confirmation`) se enviará al `migration_router` (que no la maneja y arroja error 404), impidiendo que la Curva se gradúe. Si es la Curva, el `migration_router` no puede configurar el locker (error 401) y los tokens LP son rechazados al llegar con error 406 (`ERROR_NOT_INITIALIZED`).
3. **Violación Fatal de TEP-74 en la Transferencia de Jettons**: El contrato intenta enviar el mensaje `op::transfer()` directamente a la wallet Jetton del DEX Router (`router_token_wallet`), en lugar de a su propia wallet. La wallet del Router rechaza la llamada con código de salida `705` (`sender != owner`), abortando la transacción.
4. **Fallo Sistemático On-Chain del Router de STON.fi en Testnet**: Consultas directas a la blockchain y el historial de transacciones demuestran que el Router oficial de STON.fi v2.1 Testnet (`kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v`) arroja **`exit_code: 9` ("Cell underflow", 2 pasos VM)** en el 100% de las transacciones entrantes, haciendo inviable cualquier prueba en vivo con ese contrato en su estado actual.

---

## 2. METODOLOGÍA Y CLASIFICACIÓN DE EVIDENCIA

Para garantizar rigor e imparcialidad, se clasifica cada hecho en una de cuatro categorías:

| Categoría | Definición | Nivel de Certeza |
| :--- | :--- | :--- |
| **[DOC-PROTOCOLO]** | Documentación y repositorios oficiales de STON.fi, pTON y TON Foundation. | Canónico a nivel especificación. |
| **[ON-CHAIN]** | Lectura directa de cuentas, transacciones y estados en TON Testnet (TonAPI / Toncenter RPC). | Verificado empíricamente. |
| **[INFERENCIA-CÓDIGO]** | Análisis estático y dinámico del código fuente FunC y suites TVM locales. | Lógicamente demostrable. |
| **[NO-VERIFICADO]** | Declaraciones en informes previos no sustentadas en código o datos on-chain. | Descartado o marcado como no probado. |

---

## 3. VERIFICACIÓN DETALLADA DE LOS 12 PUNTOS OBLIGATORIOS

### 3.1. Versión exacta del Router y de pTON
- **[DOC-PROTOCOLO]**: La documentación oficial de STON.fi (`https://docs.ston.fi/developer-section/dex/smart-contracts/v2/router`) y el SDK `@ston-fi/sdk` establecen que la versión vigente es **DEX v2.1** (CPI Router) junto con **pTON v2.1**.
- **[ON-CHAIN]**:
  - Router Testnet: `kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v` (`0:0b87e24104828aee0af4a380157fd2599c4b059dda8ed2a4c2c93f83fb206c5a`). TonAPI reporta interfaz `stonfi_router_v2`.
  - pTON Minter Testnet: `kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px` (`0:024b7d03368510ecd7c0a4fbf387b78199267d2f8ca027e964356b5b6bc4d04f`). Get method `get_jetton_data` reporta URI `https://static.ston.fi/jetton/ton-proxy-v2-testnet.json`, símbolo `pGRAM`.
- **[INFERENCIA-CÓDIGO]**: Los contratos del repositorio intentan alinearse con v2.1, pero mezclan nociones de llamadas directas a minters con wallets.

### 3.2. Formato y estructura de los mensajes requeridos
- **[DOC-PROTOCOLO]**:
  - Esquema TL-B oficial para provisión de liquidez en STON.fi v2.1:
    ```tlb
    provide_lp#37c096df
      token_wallet1:MsgAddress
      refund_address:MsgAddress
      excesses_address:MsgAddress
      tx_deadline:uint64
      cross_provide_lp_body:^[
        min_lp_out:Coins
        to_address:MsgAddress
        both_positive:uint1
        fwd_amount:Coins
        custom_payload:(Maybe ^Cell)
      ] = DexPayload;
    ```
  - Esquema TL-B oficial para pTON v2.1 (`specs.tlb` en `ston-fi/pton-contracts`):
    ```tlb
    ton_transfer#01f3835d
      query_id:uint64
      ton_amount:Coins
      refund_address:MsgAddress
      forward_payload:(Either Cell ^Cell)
    = InternalMsgBody;
    ```
- **[INFERENCIA-CÓDIGO]**: La estructura binaria de las celdas en `anlgram-migration-router.fc` (líneas 147-164 y 197-205) reproduce la firma de campos de `cross_provide_lp_body` y `ton_transfer`. Sin embargo, el encapsulamiento y el destinatario de estos mensajes están viciados en origen (ver secciones 3.3 y 3.5).

### 3.3. Destinatario correcto de cada mensaje y wallets Jetton implicadas
- **[DOC-PROTOCOLO]** & **[TEP-74]**:
  - En TON, un contrato o usuario que posee Jettons **NO** puede transferirlos enviando un mensaje a la wallet del receptor.
  - El mensaje `op::transfer()` (`0x0f8a7ea5`) **DEBE** enviarse a la **wallet Jetton propia del emisor** (`sender_jetton_wallet`).
  - La wallet propia del emisor descuenta el saldo local, emite `internal_transfer` (`0x178d4519`) a la wallet del receptor (`router_jetton_wallet`), y esta última emite `transfer_notification` (`0x7362d09c`) al DEX Router con el `forward_payload`.
- **[INFERENCIA-CÓDIGO]**:
  - En `anlgram-migration-router.fc` líneas 180-185:
    ```func
    var jetton_msg = begin_cell()
        .store_uint(0x18, 6)
        .store_slice(router_token_wallet) ;; ¡ERROR CRÍTICO!
        .store_coins(150000000)
        .store_uint(1, ...)
        .store_ref(jetton_msg_body);
    send_raw_message(jetton_msg.end_cell(), 1);
    ```
  - El contrato envía `op::transfer` directamente a `router_token_wallet`.
  - La wallet `router_token_wallet` está controlada por `dex_router_address`.
  - Al recibir `op::transfer`, ejecuta: `throw_unless(705, equal_slices(owner_address, sender_address));`. Como el emisor es el Migration Router y el dueño es el DEX Router, **la transacción es rechazada instantáneamente con código de salida 705**.
  - Los 200M tokens depositados por la curva residen en `migration_router_jetton_wallet`, pero el Migration Router intenta transferir desde la wallet del DEX.

### 3.4. Consulta y creación del pool según interfaces oficiales
- **[DOC-PROTOCOLO]**:
  - En STON.fi v2.1, los pools son contratos deterministas calculados por el Router a partir del código de pool y los pares de wallets: `get_pool_address(token_wallet0, token_wallet1)`.
  - Si un pool no existe, la primera provisión de liquidez enviada al Router despliega el pool mediante `state_init` que el propio Router genera internamente.
- **[INFERENCIA-CÓDIGO]**:
  - `anlgram-migration-router.fc` no calcula el pool ni valida las wallets; requiere que se le pasen por parámetro externo (`router_token_wallet`, `lp_token_wallet`, `pton_wallet`).
  - Como se demostró, nadie puede pasarle estos parámetros porque la única entidad autorizada a llamar `execute_dex_provision` es la Curva, y la Curva carece de código para calcularlos o transmitirlos.

### 3.5. Compatibilidad de la ruta de TON nativo y pTON con la migración prevista
- **[DOC-PROTOCOLO]**:
  - STON.fi v2.1 no acepta TON nativo directo en el router para swaps o pools CPI; requiere envoltura como pTON.
  - La envoltura se efectúa enviando `ton_transfer#01f3835d` a la **wallet pTON del emisor** (o a la bóveda pTON), la cual acuña el activo sintético y notifica al Router.
- **[INFERENCIA-CÓDIGO]**:
  - El Migration Router envía `ton_msg` a `pton_wallet` (líneas 207-212).
  - Si `pton_wallet` corresponde al minter de pTON (`STONFI_TESTNET_PTON_MASTER`), este no es una wallet y rechazará el mensaje.
  - Si corresponde a la wallet pTON del Migration Router, dicha wallet debe haber sido desplegada previamente; de lo contrario, un mensaje sin `state_init` transferirá fondos a una dirección inactiva.

### 3.6. Cálculo de importes de entrada, comisiones, gas y liquidez final
- **[INFERENCIA-CÓDIGO]**:
  - Saldo recibido por el Migration Router desde la Curva: exactamente `real_ton_reserve` = 500 TON (500,000,000,000 nanoTON).
  - Envíos estipulados en `execute_dex_provision`:
    1. A LP Locker (`set_lp_msg`): `20,000,000` (0.02 TON).
    2. A Token Wallet (`jetton_msg`): `150,000,000` (0.15 TON).
    3. A pTON Wallet (`ton_msg`): `ton_liquidity + 150,000,000` (500.15 TON).
  - **Suma requerida**: $0.02 + 0.15 + 500.15 = 500.32\text{ TON}$ (más tasas de forward de cada mensaje).
  - **Déficit de balance**: El Migration Router solo dispone de los 500.00 TON enviados por la curva. Salvo que un tercero done 0.32 TON adicionales sin asignación de balance, la fase de acción de TVM fallará con **código de error 37** (saldo insuficiente en cuenta para emitir mensajes salientes).

### 3.7. Tratamiento de errores, mensajes rebotados y devoluciones
- **[INFERENCIA-CÓDIGO]**:
  - En `anlgram-migration-router.fc` líneas 88-90:
    ```func
    int flags = cs~load_uint(4);
    if (flags & 1) {
        return (); ;; ignore bounced messages
    }
    ```
  - Si cualquiera de los mensajes salientes rebota (por ejemplo, el fallo 705 en la wallet Jetton o el fallo en pTON), el mensaje rebotado es silenciosamente descartado.
  - Sin embargo, en la línea 214-215, `ton_liquidity` y `tokens_liquidity` ya fueron puestos a cero (`ton_liquidity = 0; tokens_liquidity = 0;`).
  - La función `op::abort_migration` solo reembolsa si `ton_liquidity > 0`. Como el balance lógico se borró antes de confirmar el éxito, **los fondos devueltos quedan atrapados irrevocablemente en el balance bruto del contrato**.
  - No existe lógica alguna para recuperar los 200M tokens en caso de aborto.

### 3.8. Representación real de las posiciones de liquidez y mecanismo de custodia
- **[DOC-PROTOCOLO]**:
  - En STON.fi v2.1, el Pool actúa como Jetton Minter de los LP tokens.
  - La posición de liquidez se materializa como un saldo de Jettons LP en la wallet Jetton del usuario (`LpWallet`), correspondiente al minter del Pool.
  - El contrato `LpAccount` actúa solo como depósito transitorio de dos etapas (staging) y se autodestruye al acuñar los tokens LP hacia `to_address`.

### 3.9. Recepción del activo por LP Locker
- **[INFERENCIA-CÓDIGO]**:
  - El Pool emite los Jettons LP hacia `to_address` (configurado como `lp_locker_address`).
  - La wallet Jetton del LP Locker recibe los tokens y emite `transfer_notification` (`0x7362d09c`) a `lp_locker_address`.
  - `anlgram-lp-locker.fc` valida que el remitente sea `lp_wallet_address` y que `is_wallet_initialized == 1`.
  - Si `lp_wallet_address` fue configurada correctamente, el locker almacena el balance (`lp_amount_locked += jetton_amount`).

### 3.10. Demostración formal de bloqueo temporal/permanente y ausencia de rutas de escape
- **[INFERENCIA-CÓDIGO]**:
  - En `anlgram-lp-locker.fc` líneas 171-172:
    ```func
    throw_if(ERROR_LOCK_ACTIVE, unlock_timestamp == 0xFFFFFFFFFFFFFFFF);
    throw_if(ERROR_LOCK_ACTIVE, now() < unlock_timestamp);
    ```
  - Cuando `unlock_timestamp` se inicializa en `0xFFFFFFFFFFFFFFFF`, la condición `unlock_timestamp == 0xFFFFFFFFFFFFFFFF` es perenne. La ejecución de `op::withdraw_lp` arroja invariablemente el error `403` (`ERROR_LOCK_ACTIVE`).
  - El contrato no posee métodos de migración, actualización de código (`set_code`), cambio de dueño ni llamadas a `send_raw_message` arbitrarias.
  - **Conclusión de custodia**: Si los tokens LP genuinos logran entrar al LP Locker, **quedan bloqueados al 100% sin posibilidad matemática ni operativa de retiro**.

### 3.11. Direcciones de testnet y estado on-chain
- **[ON-CHAIN]**:
  - Se ejecutaron llamadas de lectura (`runGetMethod` y transacciones recientes) contra TonAPI y Toncenter RPC en TON Testnet:
    1. `STONFI_TESTNET_ROUTER` (`0:0b87e24104828aee0af4a380157fd2599c4b059dda8ed2a4c2c93f83fb206c5a`):
       - Estado: Activo.
       - Código: Celda de librería masterchain `5a34c333bcdcac70d41f9afca79aa6e782f1c80a5e4b2ef896ec5e20e9182c86`.
       - Ejecución: **Falla con `exit_code: 9` (Cell underflow)** tras 160 unidades de gas.
       - Evidencia histórica: Las 20 transacciones más recientes recibidas por este contrato (incluyendo transacciones de prueba de octubre de 2026 con opcodes `0x7362d09c` y `0x2993ade0`) fueron abortadas con `exit_code: 9`.
    2. `STONFI_TESTNET_PTON_MASTER` (`0:024b7d03368510ecd7c0a4fbf387b78199267d2f8ca027e964356b5b6bc4d04f`):
       - Estado: Activo y funcional como Jetton Master (`total_supply = 0`, `mintable = true`).
    3. `ANLGRAM_TESTNET_DEPLOYER_ADDRESS` (`0:73431e9265af786a888915f6873d5f9c275115f98ef87633442b0bf567918e9f`):
       - Estado: Inexistente en cadena (saldo 0 TON).

### 3.12. Incompatibilidades detectadas entre contrato actual e interfaz oficial
- Ver matriz de hallazgos en la sección 4.

---

## 4. MATRIZ DE HALLAZGOS Y EVIDENCIA

### Hallazgo 1: Deadlock Fatal de Flujo de Control — Imposibilidad de invocar `execute_dex_provision`
- **Severidad**: **CRÍTICA**
- **Archivo y Ubicación**:
  - `minter-contract/contracts/anlgram-migration-router.fc`: líneas 125–127
  - `minter-contract/contracts/anlgram-bonding-curve.fc`: líneas 619–650
- **Evidencia Verificable**:
  - `anlgram-migration-router.fc`:
    ```func
    if (op == op::execute_dex_provision) {
        throw_unless(ERROR_UNAUTHORIZED_SENDER, equal_slices(sender_address, curve_address));
    ```
  - Búsqueda en `anlgram-bonding-curve.fc`: 0 coincidencias de `execute_dex_provision` y 0 coincidencias del opcode `0x414e4c37`.
  - La Curva emite únicamente tokens y `op::deposit_ton_liquidity` (`0x414e4c36`), y pasa directamente al estado `STATE_MIGRATION_IN_PROGRESS` a la espera de `lp_locked_confirmation`.
- **Consecuencia**:
  - `execute_dex_provision` nunca puede ser ejecutado. Si un administrador o script externo lo intenta, el Migration Router aborta con código 401 (`ERROR_UNAUTHORIZED_SENDER`). La migración queda permanentemente congelada.
- **Corrección Recomendada**:
  - Rediseñar el control de acceso en el Migration Router para admitir que el administrador/deployer o un orquestador autorizado despache la ejecución de provisión (`sender == curve_address | sender == admin_address`), o bien incorporar en la Curva el envío estructurado de dicho mensaje.
- **Prueba para Confirmar Corrección**:
  - Test TVM que simule el despacho de `execute_dex_provision` por parte del llamador autorizado tras la llegada de las reservas y compruebe la emisión exitosa de los 3 mensajes DEX.

---

### Hallazgo 2: Dependencia Circular y Exclusión Mutua en `authorized_caller` de LP Locker
- **Severidad**: **CRÍTICA**
- **Archivo y Ubicación**:
  - `minter-contract/contracts/anlgram-lp-locker.fc`: líneas 56, 106, 145
  - `minter-contract/contracts/anlgram-migration-router.fc`: línea 137
  - `minter-contract/contracts/anlgram-bonding-curve.fc`: línea 657
- **Evidencia Verificable**:
  - En `anlgram-lp-locker.fc`, la variable `authorized_caller` gobierna dos acciones contradictorias:
    1. Configuración de wallet: `throw_unless(ERROR_UNAUTHORIZED_SENDER, equal_slices(sender_address, authorized_caller));`
    2. Emisión de confirmación: `.store_slice(authorized_caller)` en `confirm_msg`.
  - Si `authorized_caller` = `migration_router`:
    - El Migration Router puede configurar la wallet.
    - Pero la confirmación de bloqueo se envía a `migration_router`.
    - `migration_router` no reconoce `op::lp_locked_confirmation` (`0x414e4c33`) y falla con exit code 404 (`ERROR_UNKNOWN_OP`).
    - La Curva nunca recibe confirmación y jamás transiciona a `STATE_GRADUATED`.
  - Si `authorized_caller` = `curve_address`:
    - El Migration Router no puede configurar la wallet LP (error 401).
    - Los tokens LP que lleguen son rechazados con error 406 (`ERROR_NOT_INITIALIZED`).
- **Consecuencia**:
  - La Curva de Vinculación nunca puede alcanzar el estado de graduación exitosa.
- **Corrección Recomendada**:
  - Desacoplar las identidades en `anlgram-lp-locker.fc`:
    - Permitir configuración de wallet desde el `router_address`.
    - Enviar la confirmación `op::lp_locked_confirmation` directamente a la dirección fija `curve_address`.
- **Prueba para Confirmar Corrección**:
  - Simular el flujo completo: Configuración por Router -> Llegada de LP Tokens -> Confirmación recibida en la Curva -> Transición a `STATE_GRADUATED`.

---

### Hallazgo 3: Violación del Estándar TEP-74 en Envío de Jettons a la Wallet del Router DEX
- **Severidad**: **CRÍTICA**
- **Archivo y Ubicación**:
  - `minter-contract/contracts/anlgram-migration-router.fc`: líneas 179–185
  - `minter-contract/contracts/jetton-wallet.fc`: línea 60
- **Evidencia Verificable**:
  - `anlgram-migration-router.fc`:
    ```func
    var jetton_msg = begin_cell()
        .store_uint(0x18, 6)
        .store_slice(router_token_wallet)
        .store_coins(150000000)
        .store_uint(1, ...)
        .store_ref(jetton_msg_body);
    send_raw_message(jetton_msg.end_cell(), 1);
    ```
  - `jetton-wallet.fc`:
    ```func
    throw_unless(705, equal_slices(owner_address, sender_address));
    ```
  - La wallet destino recibe una orden `op::transfer` originada por el Migration Router, cuando el dueño de dicha wallet es el DEX Router.
- **Consecuencia**:
  - Falla fatal con código TVM `705`. El tramo de Jettons jamás ingresa a STON.fi.
- **Corrección Recomendada**:
  - El Migration Router debe calcular o almacenar la dirección de **su propia wallet Jetton** (`my_jetton_wallet`) y enviarle a ella el mensaje de transferencia, especificando como destino final la wallet del Router o la dirección del Router según requiera el payload de STON.fi.
- **Prueba para Confirmar Corrección**:
  - Test TVM con contrato Jetton Wallet real verificando que la orden de transferencia provenga del dueño legítimo (`owner == sender`).

---

### Hallazgo 4: Déficit de Saldo Operacional en Migration Router (Fallo de Gas en TVM)
- **Severidad**: **ALTA**
- **Archivo y Ubicación**:
  - `minter-contract/contracts/anlgram-migration-router.fc`: líneas 138, 182, 209
  - `minter-contract/contracts/anlgram-bonding-curve.fc`: líneas 643
- **Evidencia Verificable**:
  - Saldo entrante de TON: `ton_to_migrate` = 500 TON exactos.
  - Saldo saliente en `execute_dex_provision`:
    - `set_lp_msg`: 0.02 TON.
    - `jetton_msg`: 0.15 TON.
    - `ton_msg`: 500.00 TON + 0.15 TON = 500.15 TON.
    - Total = 500.32 TON + tasas de envío.
  - Saldo disponible en contrato = 500.00 TON.
- **Consecuencia**:
  - Saldo insuficiente en la fase de acción (TVM Action Phase Error 37). Transacción abortada.
- **Corrección Recomendada**:
  - O bien la Curva transfiere $500\text{ TON} + \text{Gas de Migración}$ (por ejemplo 500.5 TON), o bien la orden `execute_dex_provision` exige y consume gas adjunto suficiente provisto por el ejecutor (`msg_value >= 0.5 TON`).
- **Prueba para Confirmar Corrección**:
  - Verificación en TVM de que el balance neto post-ejecución no cause descubierto ni error de fase de acción con un balance inicial de 500 TON.

---

### Hallazgo 5: Pérdida Irreversible de Fondos ante Fallos de Provisión o Rebotes
- **Severidad**: **ALTA**
- **Archivo y Ubicación**:
  - `minter-contract/contracts/anlgram-migration-router.fc`: líneas 88–90, 214–215, 223–241
- **Evidencia Verificable**:
  - Línea 89 descarta mensajes con bandera rebotada (`flags & 1`).
  - Líneas 214–215 reinician las variables contables antes de recibir confirmación:
    ```func
    ton_liquidity = 0;
    tokens_liquidity = 0;
    ```
  - `op::abort_migration` evalúa `if (ton_liquidity > 0)`. Al ser 0, no devuelve ningún fondo aunque hayan rebotado los 500 TON.
  - No existe lógica de devolución para los 200M tokens en caso de aborto.
- **Consecuencia**:
  - Si cualquier tramo de la provisión DEX falla, el 100% de la liquidez en TON y el 100% de los tokens quedan irrecuperables dentro del Migration Router.
- **Corrección Recomendada**:
  - Implementar manejador de rebotes (`bounced message handler`) que restaure las variables de liquidez y permita un rescate íntegro hacia la Curva mediante `op::abort_migration` (incluyendo la orden de transferencia de vuelta de los Jettons).
- **Prueba para Confirmar Corrección**:
  - Test TVM de inyección de mensaje rebotado con `bounced = true`, verificando la reactivación de `abort_migration` y la devolución de los fondos a la Curva.

---

### Hallazgo 6: Contrato Router de STON.fi en Testnet Inoperativo On-Chain (`exit_code: 9`)
- **Severidad**: **ALTA**
- **Archivo y Ubicación**:
  - Configuración externa: `STONFI_TESTNET_ROUTER` (`kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v`)
- **Evidencia Verificable**:
  - Consulta en vivo a RPC de Toncenter / TonAPI:
    - Invocación de `get_router_data`: `{"exit_code": 9, "gas_used": 160}`.
    - Transacciones en el explorador: `077454e6...`, `a9a2669b...`, `dccbf0a3...` todas fallan con `exit_code: 9` ("Cell underflow", 2 pasos de cómputo VM).
  - Causa: La celda de datos raíz del contrato en Testnet no coincide con la especificación de desempaquetado de la librería masterchain vinculada.
- **Consecuencia**:
  - Cualquier interacción con este contrato en TON Testnet fallará de manera inmediata y predecible a nivel de máquina virtual.
- **Corrección Recomendada**:
  - Coordinar con el equipo de STON.fi para obtener la dirección del Router Testnet v2.1/v2.2 debidamente inicializado, o desplegar una instancia mock de STON.fi Router v2.1 en Testnet para las pruebas de integración de ANLGRAM.
- **Prueba para Confirmar Corrección**:
  - Consulta RPC de `get_router_data` que devuelva `exit_code: 0` con los parámetros válidos del Router antes de intentar cualquier despliegue.

---

### Hallazgo 7: Ausencia de Validación de Remitente en `transfer_notification` del Migration Router
- **Severidad**: **MEDIA**
- **Archivo y Ubicación**:
  - `minter-contract/contracts/anlgram-migration-router.fc`: líneas 115–120
- **Evidencia Verificable**:
  - `op == op::transfer_notification()` incrementa `tokens_liquidity` sin comprobar `equal_slices(sender_address, expected_wallet)`.
- **Consecuencia**:
  - Un actor malicioso puede enviar notificaciones falsas de transferencia de tokens basura para alterar el balance contable de liquidez del router antes de la migración real.
- **Corrección Recomendada**:
  - Exigir que el remitente coincida con la wallet Jetton calculada a partir del `token_minter_address` y el código de wallet.
- **Prueba para Confirmar Corrección**:
  - Test TVM de inyección de `transfer_notification` desde una dirección no autorizada verificando que sea rechazada.

---

### Hallazgo 8: Falta de Resolución Dinámica On-Chain de la Dirección del Pool
- **Severidad**: **MEDIA**
- **Archivo y Ubicación**:
  - `minter-contract/contracts/anlgram-migration-router.fc`: líneas 130–132
- **Evidencia Verificable**:
  - El contrato asume que las wallets y el pool ya existen antes de la graduación y los recibe como argumentos externos.
  - Para un token recién creado en la curva, el pool no existe previamente.
- **Consecuencia**:
  - Dependencia de cálculos off-chain manuales propensos a error humano que, de fallar en un solo parámetro, dejan el LP Locker permanentemente inutilizado (debido a `throw_if(ERROR_ALREADY_INITIALIZED)`).
- **Corrección Recomendada**:
  - Implementar en scripts de orquestación la derivación estricta y prueba en seco de las direcciones del Pool y de la wallet LP del Locker antes de enviar la transacción de provisión.
- **Prueba para Confirmar Corrección**:
  - Script de validación criptográfica previa que compruebe la coincidencia de hashes de estado (`StateInit`) de las wallets involucradas.

---

## 5. TABLA DE CLASIFICACIÓN DE EVIDENCIA

| Tema Verificado | Clasificación | Fuente / Evidencia Primaria | Estado |
| :--- | :--- | :--- | :--- |
| **Versión STON.fi v2.1 y pTON v2.1** | **[DOC-PROTOCOLO]** | Repositorios oficiales `ston-fi/sdk` y `ston-fi/dex-core-v2`. | Conforme conceptualmente |
| **Opcode `provide_lp#37c096df`** | **[DOC-PROTOCOLO]** | Documentación oficial STON.fi v2.1 y `specs.tlb`. | Conforme |
| **Opcode `ton_transfer#01f3835d`** | **[DOC-PROTOCOLO]** | Repositorio oficial `ston-fi/pton-contracts`. | Conforme |
| **Destinatario de `op::transfer` (TEP-74)** | **[INFERENCIA-CÓDIGO]** | Líneas 180-185 en `anlgram-migration-router.fc` vs estándar TEP-74. | **INCUMPLIDO (Error 705)** |
| **Invocación de `execute_dex_provision`** | **[INFERENCIA-CÓDIGO]** | Comparación estática entre `anlgram-bonding-curve.fc` y router. | **BLOQUEADO (Deadlock)** |
| **Exclusión mutua en LP Locker** | **[INFERENCIA-CÓDIGO]** | Análisis de control de flujo en `anlgram-lp-locker.fc`. | **BLOQUEADO (Conflicto)** |
| **Balance de Gas Operacional** | **[INFERENCIA-CÓDIGO]** | Suma algebraica de valores en `anlgram-migration-router.fc` (500.32 vs 500.00). | **DEFICITARIO (Error 37)** |
| **Manejo de Mensajes Rebotados** | **[INFERENCIA-CÓDIGO]** | Líneas 88-90 y 214-215 de `anlgram-migration-router.fc`. | **DEFICIENTE (Pérdida de fondos)** |
| **Bloqueo Permanente en LP Locker** | **[INFERENCIA-CÓDIGO]** | Línea 171 de `anlgram-lp-locker.fc` (`0xFFFFFFFFFFFFFFFF`). | **VERIFICADO Y SEGURO** |
| **Operatividad Router Testnet** | **[ON-CHAIN]** | Consultas RPC y transacciones en TonAPI / Toncenter. | **INOPERATIVO (`exit_code: 9`)** |
| **Operatividad pTON Testnet** | **[ON-CHAIN]** | Consulta `get_jetton_data` en `kQACS30D...`. | **ACTIVO Y CONFORME** |
| **Afirmaciones de informes previos (ej. "Todo resuelto")** | **[NO-VERIFICADO]** | Informes previos de Fase 2C que declararon "Blocker B y C Resueltos". | **REFUTADO POR EVIDENCIA TÉCNICA** |

---

## 6. CONCLUSIONES Y RECOMENDACIONES PARA EL RESPONSABLE DE FASE 3B

### Resumen del Veredicto
El estado del módulo de integración con STON.fi es **`BLOQUEADO`**.

El sistema no puede ser desplegado en Testnet con la expectativa de una migración exitosa. Si la Curva de Vinculación alcanzara la graduación en las condiciones actuales:
1. Las reservas se transferirían al Migration Router.
2. Nadie podría ejecutar la provisión DEX (Deadlock).
3. Si se forzara la ejecución modificando permisos, la transferencia de tokens fallaría con código 705 (Wallet errónea).
4. El balance de TON quedaría deficitario por 0.32 TON (Fallo 37).
5. Y si se superaran los puntos anteriores, el Router de STON.fi en Testnet abortaría la transacción con código 9 (Cell underflow).

### Recomendaciones Obligatorias de Remediación (Fase 3B)
1. **Corregir el Enrutamiento TEP-74**: Modificar el Migration Router para que envíe `op::transfer` a **su propia wallet Jetton**, incluyendo como destinatario la wallet del Router o Router según la especificación de STON.fi.
2. **Resolver el Control de Flujo de Graduación**:
   - Opción A: Permitir que `execute_dex_provision` sea llamado por el `admin_address` una vez que `ton_liquidity` y `tokens_liquidity` hayan sido depositados.
   - Opción B: Automatizar el envío de `execute_dex_provision` desde la Curva adjuntando los fondos de gas necesarios.
3. **Desacoplar las Identidades en `anlgram-lp-locker.fc`**:
   - Separar el permiso de inicialización de la wallet LP (`router_address`) del destinatario de la confirmación de bloqueo (`curve_address`).
4. **Subsanar el Déficit de Gas**:
   - Asegurar que la provisión cuente con al menos 0.5 TON de gas operacional adicional sobre el principal de 500 TON.
5. **Implementar Rescate y Rebote**:
   - Conservar la contabilidad de liquidez hasta confirmar la recepción de los LP tokens; en caso de rebote o aborto, permitir el retorno del 100% de los TON y los Jettons a la Curva.
6. **Validar Entorno Testnet de STON.fi**:
   - No utilizar `kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v` hasta que el equipo de STON.fi solucione el error de celda o provea un endpoint sustituto activo.
