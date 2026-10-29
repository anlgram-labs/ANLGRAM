# ANLGRAM MemeLabs — Informe de Fase 3C.2: Revisión Manual de Seguridad del Ejecutor

**Fecha:** 29 de octubre de 2026  
**Rama:** `feature/launchpad-phase3c2`  
**Commit Auditado:** `43cf77f` (`fix(launchpad): phase 3c.1 router immutability fix, dex v2.2 config & supervised deployment tool`)  
**Entorno de Trabajo:** Git Worktree aislado (`E:\anlgram-phase3c2`)  
**Dictamen Final:** `APROBADO PARA REVISIÓN FINAL DEL PROCEDIMIENTO`  
*(Aviso imperativo: Este dictamen NO constituye una autorización para ejecutar el despliegue on-chain).*

---

## 1. Estado del Repositorio y Entorno de Auditoría

En cumplimiento estricto de las reglas innegociables establecidas para la Fase 3C.2:

- **Worktree Aislado:** La auditoría se realizó en un árbol de trabajo independiente (`E:\anlgram-phase3c2`), desvinculado del repositorio principal y de las ramas de producción.
- **Ramas y Commits Base:**
  - Rama activa: `feature/launchpad-phase3c2`
  - Commit HEAD auditado: `43cf77f22368e35e50efb0ba1ec7840331e2e875`
  - Commit padre: `09913a2` (Fase 3C.0 Readiness Gate)
- **Integridad de Producción:**
  - La rama `main` no fue modificada, consultada para escritura ni fusionada.
  - El creador de Jettons y la interfaz web de producción permanecen intactos.
  - Ningún archivo de configuración productivo fue sobrescrito.
  - No se realizaron operaciones de `git push`, `git merge` ni alteraciones de historial.

---

## 2. Capacidades Reales del Ejecutor (`deploy-launchpad-testnet-exec.js`)

Se realizó una inspección exhaustiva línea por línea del código fuente del ejecutor (`minter-contract/deploy-launchpad-testnet-exec.js`, 572 líneas) y de sus módulos dependientes (`@ton/core`, `crypto`, `fs`, `path`, `readline`).

### 2.1. Matriz de Capacidades Reales del Código

| Capacidad Evaluada | ¿Presente en el Código? | Evidencia Técnica en el Código Fuente |
|---|---|---|
| **Firmar Mensajes** | **NO** | No importa `@ton/crypto`, `mnemonicToPrivateKey`, `mnemonicToWalletKey`, `keyPairFromSeed` ni ninguna rutina criptográfica de firma ed25519. |
| **Enviar Transacciones** | **NO** | No importa `WalletContractV4` ni implementa llamadas a `sendTransfer`, `sendExternalMessage`, `sendRawMessage`, `sendBoc` o APIs de emisión RPC. |
| **Desplegar Contratos** | **NO** | Solo computa de forma pura la función matemática `contractAddress(0, stateInit)` y emite las cadenas de texto correspondientes en consola. |
| **Ejecutar Inicializaciones** | **NO** | Las fases de inicialización (LP Locker, Launchpad, Mint 1B, Renounce) solo están descritas como cadenas informativas en `printPlan()`. No se construyen celdas de mensaje ni cuerpos BOC para estas operaciones. |
| **Continuar Automáticamente tras Error** | **NO** | Implementación estricta *fail-closed*. Si `validateNetworkConfig` o `verifyArtifacts` retornan errores, el script retorna inmediatamente código de salida `1` sin ejecutar ninguna lógica posterior. |
| **Cambiar Direcciones de Contratos** | **NO** | Los endpoints del DEX están fijados en constantes inmutables (`APPROVED_TESTNET_DEX`). Las direcciones de los contratos se calculan determinísticamente a partir del código compilado y el StateInit. |
| **Utilizar Endpoints de Mainnet por Accidente** | **NO** | `validateNetworkConfig()` exige de forma obligatoria `TON_NETWORK === 'testnet'` y `TON_GLOBAL_ID === '-3'`. Además, valida que los hosts RPC pertenezcan a la lista blanca (`testnet.toncenter.com`, `testnet.tonapi.io`) y que las direcciones posean la bandera testnet (`tag & 0x80 != 0`). Las direcciones de mainnet (`EQ...`) son rechazadas. |
| **Reutilizar Despliegue Anterior Incompatible** | **PARCIAL / LIMITACIÓN** | El ejecutor actual deriva direcciones deterministas pero **no consulta el estado on-chain** para verificar si la dirección ya tiene código desplegado o transacciones previas en testnet. No existe un archivo de estado persistente (`deployment-state.json`). *(Ver Sección 10).* |

### 2.2. Confirmación de Bloqueo del Modo de Ejecución

- **Modo Predeterminado (Solo Lectura):** Si no se proporcionan argumentos o se pasa `--plan`, el evaluador activa exclusivamente `flags.plan = true`, genera el informe de direcciones y finaliza con código `0` sin tocar la red.
- **Modo de Ejecución Futura (`--execute-testnet`):**
  - Si se invoca sin `--supervised-human-approved`, el ejecutor aborta de inmediato con código `2` y el mensaje: `EXECUTION REJECTED: --execute-testnet requires explicit --supervised-human-approved flag`.
  - Si se invoca con ambas banderas (`--execute-testnet --supervised-human-approved`), el ejecutor ejecuta las líneas 543-547:
    ```javascript
    console.log('\n⚠️  PHASE 3C.1 POLICY ENFORCEMENT:');
    console.log('Live transaction broadcasting is strictly disabled during Phase 3C.1.');
    console.log('The execution engine is fully built and verified, awaiting formal testnet deployment session.');
    console.log('Status: PREPARADO PARA REVISIÓN MANUAL DEL EJECUTOR.');
    return 0;
    ```
    **Conclusión:** No existe ninguna ruta en el código fuente que permita la transmisión de transacciones o el contacto de escritura con la blockchain. La función de broadcast permanece efectivamente no implementada / bloqueada.

---

## 3. Confirmación de Cero Transmisión de Transacciones

Se certifica formalmente que durante la ejecución de esta auditoría:

1. **Cero transacciones transmitidas:** No se estableció ninguna conexión HTTP de tipo POST, WebSocket ni RPC de broadcast hacia ningún nodo o indexador de TON (ni testnet ni mainnet).
2. **Cero firmas generadas:** No se utilizó ninguna clave privada, semilla mnemónica ni mecanismo de firma local o remoto.
3. **Cero mutaciones on-chain:** Ningún contrato fue desplegado, modificado ni inicializado.

---

## 4. Auditoría de Direcciones, StateInit y Artefactos Compilados

### 4.1. Verificación de Endpoints de Infraestructura Externa (Testnet)

Se comprobó la coincidencia exacta de los endpoints externos configurados en el ejecutor:

| Parámetro | Dirección Prevista en Testnet | Dirección en `deploy-launchpad-testnet-exec.js` | Formato Raw (Workchain 0) | Estado |
|---|---|---|---|---|
| **STON.fi Router v2.2** | `kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn` | `kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn` | `0:05a5e18525003d2aa882c5767c27897ffef4980311528ab48ebcf1e7e92497e3` | **VALIDADO (Coincidencia exacta)** |
| **pTON v2 Master** | `kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px` | `kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px` | `0:0092df40d7a1443b35f0293efce1ede066499f4be32809fa590d5ad6daf13413` | **VALIDADO (Coincidencia exacta)** |

El enrutador v2.1.0 obsoleto (Candidato A: `kQALh-JBBIKK...`) se encuentra explícitamente vetado en la lógica de validación del ejecutor.

### 4.2. Integridad Criptográfica de los Artefactos Compilados

Se verificaron los 4 artefactos en `minter-contract/build/*.compiled.json`. Los hashes SHA256 del BOC coinciden bit a bit con los hashes calculados a partir de los buffers de código:

| Contrato | Archivo de Artefacto | Hash de Celda de Código (`codeCellHash`) | Hash SHA256 de BOC (`bocFileSha256`) | Integridad |
|---|---|---|---|---|
| **Launchpad Jetton Master** | `anlgram-launchpad-jetton-minter.compiled.json` | `90b5069f199fcea56ef467dd25cf8420c5e9848ba0fcc0cc139424c5cac17aec` | `92b25bfa090b89cdb453f50ae268c53dbae87ffffdb7e15b99e9bc9396ef2a00` | **VERIFICADO** |
| **Bonding Curve** | `anlgram-bonding-curve.compiled.json` | `dae0ca19cd71c54fd4bbf90e545f1de38c66bc5de7ad5bdc37eaa8dd8ea62eae` | `f9d62f52d4ccb71fd95d93d9fe57d961e37165159e456b55aa0c9a9a48f12797` | **VERIFICADO** |
| **LP Locker** | `anlgram-lp-locker.compiled.json` | `e9da326d9ad2ec259112743a2e581fc5783693e9ee2d7371e5ff249bcaf97536` | `36ac2eaf0c360eb795984a4a0d7d94eaf6d9e2f3fe37178cc7285c90901dcb6a` | **VERIFICADO** |
| **Migration Router** | `anlgram-migration-router.compiled.json` | `ad789269bb790232a0fcb7a4c711099e295496298db9b1fdeaac65ada26ef844` | `35c57ebf83cb11dd2c7b6801437ba5d25efdae8912accaea632210071dda2139` | **VERIFICADO** |

### 4.3. Dependencias de StateInit en Cada Contrato

Se analizó la función `deriveDeterministicAddresses` para comprobar la inyección de dependencias en los datos iniciales (`data cell`):

1. **Launchpad Minter:**
   - Dependencias de otros contratos: **Ninguna**.
   - Solo almacena: `total_supply: 0`, `admin_address: deployer`, `content`, `wallet_code`.
2. **Bonding Curve:**
   - Dependencias inyectadas en StateInit: `jetton_minter_address` (dirección calculada del Minter), `dex_router_address` (STON.fi v2.2), `treasury_address`, `admin_address`.
   - Campos no vinculados en StateInit (puestos a `addr_none`): `curve_jetton_wallet`, `lp_locker_address`, `migration_router_address`.
3. **LP Locker:**
   - Dependencias inyectadas en StateInit: `curve_address` (dirección calculada de la Curva).
   - Campos no vinculados en StateInit: `pool_address`, `lp_wallet_address`, `router_address`.
4. **Migration Router:**
   - Dependencias inyectadas en StateInit: `curve_address`, `lp_locker_address`, `dex_router_address`, `token_minter_address`, `pton_minter_address`.
   - Campos no vinculados en StateInit: `my_token_wallet`.

**Conclusión:** El grafo de dependencias es estrictamente acíclico:
$$\text{Minter} \longrightarrow \text{Bonding Curve} \longrightarrow \text{LP Locker} \longrightarrow \text{Migration Router}$$

---

## 5. Revisión Exhaustiva de `set_migration_router` y Riesgos de Enrutamiento

### 5.1. Verificación de Inmutabilidad en el Código del Contrato

Se auditó el código de `minter-contract/contracts/anlgram-bonding-curve.fc` (líneas 773–800):

```func
if (op == op::set_migration_router) {
    throw_unless(ERROR_UNAUTHORIZED, equal_slices(sender_address, creator_address) | equal_slices(sender_address, admin_address));
    
    ;; INVARIANTE 1: Solo configurable durante STATE_INITIALIZING
    throw_unless(ERROR_INVALID_STATE, state == STATE_INITIALIZING);

    ;; INVARIANTE 2: Guardia de configuración única (ERROR_ALREADY_INITIALIZED = 413)
    throw_if(ERROR_ALREADY_INITIALIZED, migration_router_address.preload_uint(2) != 0);

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

Adicionalmente, se auditó `op::init_launchpad` (`0x414e4c01`, líneas 296–340):
- Exige que `new_migration_router` no sea nulo (`throw_if(408, new_migration_router.preload_uint(2) == 0)`).
- Al ejecutarse, almacena `new_migration_router` y cambia el estado a `STATE_INITIALIZING`.
- En consecuencia, una vez ejecutado `init_launchpad`, cualquier invocación subsiguiente a `op::set_migration_router` fallará con código `413` porque `migration_router_address.preload_uint(2) != 0`.

En los estados operativos posteriores:
- `STATE_ACTIVE` (3): `op::set_migration_router` arroja `ERROR_INVALID_STATE` (`407`).
- `STATE_GRADUATION_PENDING` (4): Arroja `407`.
- `STATE_MIGRATION_FAILED` (6): Arroja `407`. En este estado, la única operación admisible es `op::retry_migration`, la cual despacha fondos **exclusivamente al router inmutable registrado originalmente**.

### 5.2. Análisis de Vulnerabilidad: ¿Puede un Administrador Configurar una Dirección Arbitraria Antes de Activar Trading?

> [!WARNING]
> **Hallazgo Crítico de Seguridad On-Chain vs. Off-Chain:**  
> A nivel de contrato inteligente en la TVM, el contrato `anlgram-bonding-curve.fc` valida que `new_migration_router` no sea nulo (`preload_uint(2) != 0`) y que no colisione con el Minter, la Curva, el LP Locker o la billetera Jetton.  
> **Sin embargo, la TVM no verifica ni puede verificar criptográficamente si la dirección recibida corresponde efectivamente al código compilado de `anlgram-migration-router.fc`.** En TON, verificar el código de una dirección requeriría recibir e inspeccionar el `StateInit` completo en el mensaje, lo que no ocurre en este flujo.  
> 
> Por lo tanto, si un administrador malicioso o un script manipulado enviara una dirección externa controlada por el atacante en `op::init_launchpad` o `op::set_migration_router`, el contrato de la Curva la aceptaría y la fijaría de forma inmutable. Al alcanzar los 500 TON de graduación, los fondos se transferirían a esa dirección arbitraria.

### 5.3. Exigencia Imperativa para el Ejecutor Off-Chain

Para neutralizar por completo este riesgo:
1. El ejecutor debe **derivar de forma determinista y estricta la dirección del Migration Router** a partir del hash de su `StateInit` (código compilado + datos vinculados).
2. El mensaje de inicialización `op::init_launchpad` (o `op::init_lp_locker`) **debe construir el payload inyectando únicamente la dirección calculada derivada internamente**.
3. El ejecutor **no debe admitir parámetros CLI, variables de entorno o sobreescrituras manuales** para la dirección del Migration Router o LP Locker.

---

## 6. Revisión del Orden de Despliegue e Inicialización (Bootstrap)

Se auditó la secuencia completa de despliegue y bootstrap. La tabla documenta cada paso, mensajes, confirmaciones on-chain requeridas y mecanismos de contingencia:

| Paso | Contrato | Dirección Esperada | Mensaje / Opcode | Confirmación On-Chain Requerida | Comportamiento si Rebota / Falla | Prevención de Repetición | Bloqueo en Cascada si Falla |
|---|---|---|---|---|---|---|---|
| **D1** | Launchpad Minter | `minterAddress` (Derivada) | Deploy StateInit + 0.08 TON | `get_jetton_data` retorna `total_supply == 0`, `admin == deployer`, estado de cuenta `active`. | Fondos regresan a deployer (menos gas). Cuenta permanece `uninitialized`. | Si la cuenta ya está `active`, re-desplegar StateInit es ignorado por la TVM. | **BLOQUEA TODO** (D2, D3, D4 y bootstrap). |
| **D2** | Bonding Curve | `curveAddress` (Derivada con Minter) | Deploy StateInit + 0.15 TON | `get_curve_state` retorna `state == 0` (`STATE_UNINITIALIZED`), reservas iniciales correctas. | Fondos rebotan. Cuenta no activa. | StateInit idéntico no muta cuenta activa. | **BLOQUEA** D3, D4 y bootstrap. |
| **D3** | LP Locker | `lockerAddress` (Derivada con Curve) | Deploy StateInit + 0.10 TON | `get_locker_status` retorna `is_locked == 0`, `is_router_initialized == 0`. | Fondos rebotan. Cuenta no activa. | StateInit idéntico no muta cuenta activa. | **BLOQUEA** D4 y bootstrap. |
| **D4** | Migration Router | `migratorAddress` (Derivada con Minter, Curve, Locker, DEX) | Deploy StateInit + 0.12 TON | `get_router_status` retorna `is_initialized == 0`, reservas 0. | Fondos rebotan. Cuenta no activa. | StateInit idéntico no muta cuenta activa. | **BLOQUEA** fases de bootstrap. |
| **B1** | LP Locker | `lockerAddress` | `op::init_lp_locker` (`0x414e4c39`) con `migratorAddress` (0.05 TON) | Getter en LP Locker confirma `is_router_initialized == 1` y `router_address == migratorAddress`. | LP Locker permanece `is_router_initialized == 0`. Deployer recibe rebote. | `throw_if(ERROR_ALREADY_INITIALIZED, is_router_initialized == 1)` (código 405). | **BLOQUEA** B2, B3 y B4. |
| **B2** | Bonding Curve | `curveAddress` | `op::init_launchpad` (`0x414e4c01`) con Minter, Locker, Migrator, Router (0.06 TON) | `get_curve_state` retorna `state == 1` (`STATE_INITIALIZING`), getters de router y locker devuelven direcciones esperadas. | Curva permanece en `state == 0`. | `throw_unless(ERROR_INVALID_STATE, state == STATE_UNINITIALIZED)` (código 407). | **BLOQUEA** B3 y B4. |
| **B3** | Launchpad Minter | `minterAddress` | Acuñar 1B tokens a Curva + `op == 3` (renounce a `addr_none`) (0.10 TON) | Minter emite notificación. Curva transiciona a `state == 2` (`STATE_RENOUNCE_PENDING`). Minter `admin == addr_none`. | Si acuñación falla, Curva se queda en estado 1. Si renuncia falla, admin no es nulo. | Si admin es `addr_none`, cualquier intento de mint o cambio de admin arroja excepción TVM 73. | **BLOQUEA** B4. |
| **B4** | Bonding Curve | `curveAddress` | `op::admin_changed_notification` (`0x7a3e810f`) procesado por Curva (0.05 TON) | `get_curve_state` retorna `state == 3` (`STATE_ACTIVE`). Trading formalmente inaugurado. | Curva permanece en `STATE_RENOUNCE_PENDING`. Se puede reintentar con `op::check_renounce`. | Curva en `STATE_ACTIVE` rechaza notificaciones repetidas con código `407`. | Finaliza el proceso. |

> [!IMPORTANT]
> **Principio de Verificación On-Chain:** Una respuesta HTTP 200 de un proveedor RPC solo certifica que el mensaje fue recibido en mempool, **no que fue ejecutado exitosamente on-chain**. Cada paso debe confirmar la transición consultando el estado de cuenta y los getters del contrato en la blockchain.

---

## 7. Presupuesto de Gas y Limitaciones Financieras

### 7.1. Análisis Crítico del Presupuesto

El presupuesto planteado en la Fase 3C.1 y codificado en `DEPLOYMENT_BUDGET` establece:
- Costo neto de gas de las 8 operaciones: **0.71 TON**.
- Reserva operativa de red (fluctuaciones y storage rent): **1.50 TON**.
- Buffer de aprovisionamiento de gas para el router DEX: **0.50 TON**.
- **Saldo Mínimo Requerido:** **2.71 TON**.
- **Saldo Recomendado:** **3.50 TON**.

### 7.2. Evidencia de Respaldo vs. Costes Impredecibles

1. **Costes respaldados por evidencia:**  
   En las simulaciones locales de la TVM (`SmartContract`), los costos de ejecución de las fases de cómputo oscilan entre 0.003 y 0.015 TON por mensaje interno simple. Las asignaciones de 0.05 a 0.15 TON por paso ofrecen un margen holgado (entre 3x y 10x) sobre las tarifas de cómputo estándar.
2. **Costes que NO pueden conocerse con precisión antes de la ejecución real:**
   - **Tarifas de Almacenamiento (Storage Rent):** Dependen de los parámetros de configuración global de la red (`ConfigParam 18, 20, 21`) y del tiempo exacto que transcurra entre la creación de las cuentas y su activación.
   - **Tarifas de Reenvío de Mensajes (Forward Fees):** Dependen de la profundidad del árbol de celdas y del número de referencias en los cuerpos de los mensajes con StateInit grandes.
   - **Congestión y Volatilidad de Gas en Testnet:** Variaciones en los validadores de testnet pueden elevar temporalmente los costos base.
3. **Advertencia Obligatoria:**  
   **Tener 3.50 TON en la billetera no garantiza de forma matemática e incondicional que todo el procedimiento se completará sin interrupción.** Si bien representa un saldo prudente y estadísticamente suficiente para condiciones normales de testnet, el ejecutor debe verificar el saldo remanente antes de cada mensaje individual.

### 7.3. Protección Inviolable de los 500 TON de Liquidez

Se reitera el principio económico fundamental del launchpad:
- Los 500 TON necesarios para fondear el pool STON.fi provienen **única y exclusivamente de los depósitos acumulados por los compradores** a lo largo de la curva de vinculación durante la fase activa de trading (`STATE_ACTIVE`).
- La billetera del operador **nunca aporta ni subsidia los 500 TON**, ni estos fondos deben ser confundidos como reserva de gas para el despliegue.

---

## 8. Gestión de Secretos y Superficie de Ataque

Se verificó el cumplimiento de las políticas de seguridad de credenciales:

1. **Cero Secretos en el Repositorio:** No existen claves privadas, mnemonics ni secretos de wallets en ningún archivo commiteado en el repositorio Git.
2. **Prohibición de Secretos en CLI:** El analizador de argumentos de línea de comandos en `deploy-launchpad-testnet-exec.js` detecta argumentos que comiencen por `--mnemonic`, `--seed` o `--key` y aborta inmediatamente con un error de violación de seguridad (`SECURITY VIOLATION`), evitando que las semillas queden expuestas en el historial del shell del sistema operativo (`.bash_history`, `ConsoleHost_history.txt`).
3. **Cero Fugas en Logs:** En las pruebas automatizadas de `test-deploy-launchpad-testnet-exec.js`, se inyectaron variables simuladas (`TESTNET_DEPLOYER_MNEMONIC: "SECRET_DO_NOT_PRINT"`) y se verificó que ninguna salida en `stdout` o `stderr` reproduzca el secreto.
4. **Requisitos para la Ejecución Futura:** La ejecución supervisada futura no debe solicitar ni almacenar la frase semilla en archivos de configuración ni variables de entorno del servidor. Se recomienda el uso de un firmador externo (hardware wallet, extensión Tonkeeper interactiva o lector efímero en memoria que destruya la clave tras firmar).
5. **Aislamiento contra Mainnet:** El sistema valida la cadena de red (`testnet`), el `global_id` (`-3`) y las direcciones con formato testnet (`kQ...`). Una credencial de mainnet no puede ser utilizada por error en este ejecutor.

---

## 9. Pruebas Locales Ejecutadas y Resultados Reales

Se ejecutaron las suites de pruebas aplicables en el entorno local aislado sin transmitir transacciones y sin requerir secretos:

### Tabla de Resultados de Pruebas Ejecutadas

| Suite de Prueba | Tipo de Prueba | Comando Ejecutado | Pruebas Pasadas | Pruebas Fallidas | Estado |
|---|---|---|---|---|---|
| **Auditoría del Ejecutor** | Pruebas Unitarias de Seguridad | `node minter-contract/test-deploy-launchpad-testnet-exec.js` | 23 | 0 | **PASADA** |
| **Simulación TVM Contratos** | Simulación en TVM Local | `node test-bonding-curve-tvm.js` | 154 | 0 | **PASADA** |
| **Candidatos de Router DEX** | Simulación de Payloads TVM | `node test-router-candidates-tvm.js` | 11 | 0 | **PASADA** |
| **Matemáticas Curva AMM** | Pruebas Unitarias Numéricas | `node minter-contract/test-bonding-curve-math.js` | 46 | 0 | **PASADA** |
| **Validación Preflight Despliegue** | Validación Estática de Config | `node minter-contract/test-deploy-launchpad-testnet.js` | 9 | 0 | **PASADA** |
| **Proveedor Blockchain** | Pruebas de Abstracción Offline | `node test-blockchain-provider.js` | 25 | 0 | **PASADA** |

*Total de pruebas locales ejecutadas en esta fase:* **268 pruebas pasadas, 0 fallidas (100% éxito)**.

### Distinción Metodológica de las Pruebas

- **Pruebas Locales / Unitarias:** Verificación pura de sintaxis, parsing de argumentos CLI, checksum CRC16 de direcciones TON y matemáticas de producto constante.
- **Simulaciones TVM:** Ejecución de bytecode real dentro del emulador TVM local de `@ton/sandbox` / `SmartContract`, evaluando códigos de salida reales (0, 73, 401, 407, 408, 413).
- **Comprobaciones de Solo Lectura:** Inspección de archivos compilados, cálculo de hashes SHA256 de BOCs y evaluación estática de dependencias.
- **Integración Real On-Chain:** **NO EJECUTADA.** El despliegue de contratos en TON testnet y la interacción con la blockchain en vivo no formaron parte de esta auditoría y permanecen bloqueados.

---

## 10. Riesgos Restantes y Correcciones Necesarias

Antes de proceder a una sesión de ejecución supervisada, se identifican los siguientes riesgos técnicos y las medidas correctivas que deben implementarse:

1. **Ausencia de Verificación de Estado On-Chain Previo:**  
   *Riesgo:* Si el operador ejecuta el despliegue pero alguna de las direcciones deterministas calculadas ya contiene código o saldo en testnet (por ejemplo, de un ensayo anterior con el mismo deployer), la secuencia podría colisionar o generar comportamientos inconsistentes.  
   *Corrección:* El ejecutor debe implementar un paso previo de solo lectura que consulte `getAccountState` en TON RPC para cada una de las 4 direcciones calculadas y verifique que su estado sea estrictamente `uninitialized` o `nonexist`.
2. **Inyección Estricta del Migration Router Derivado:**  
   *Riesgo:* Conforme a la Sección 5.2, la Curva on-chain no valida el código del Migration Router.  
   *Corrección:* Cuando se construyan los payloads de `init_launchpad` y `init_lp_locker`, el generador de mensajes debe enlazar única y exclusivamente la variable `migratorAddress` generada por `deriveDeterministicAddresses()`.
3. **Verificación de Confirmaciones por Transacción y no por HTTP:**  
   *Riesgo:* Si la futura herramienta de ejecución simplemente envía el BOC y asume éxito con HTTP 200, transacciones revertidas en la fase de acción pasarán desapercibidas.  
   *Corrección:* El protocolo de ejecución supervisada debe incorporar un bucle de sondeo (*polling*) con tiempo límite que espere la inclusión del bloque en la blockchain, verifique el `exit_code: 0` y valide los getters del contrato antes de habilitar el siguiente paso.
4. **Verificación de Saldo Paso a Paso:**  
   *Riesgo:* Una caída inesperada de saldo a mitad del proceso podría abortar la inicialización en un estado intermedio irrecuperable (por ejemplo, después de acuñar tokens pero antes de la renuncia de admin).  
   *Corrección:* El ejecutor debe comprobar que el saldo de la wallet operadora sea $\ge 2.71\text{ TON}$ al inicio y que mantenga un piso seguro antes de despachar cada mensaje subsiguiente.

---

## 11. Procedimiento Recomendado para la Futura Ejecución Supervisada

Cuando se programe la sesión de despliegue interactivo en TON testnet, se recomienda el siguiente procedimiento paso a paso:

1. **Pre-requisitos de Entorno:**
   - Wallet operadora financiada con **3.50 TON** en testnet.
   - Endpoint HTTPS verificado contra `testnet.toncenter.com` con API Key válida.
   - Confirmación de que las 4 direcciones deterministas no existen en testnet.
2. **Paso a Paso con Autorización Humana Explícita:**
   - La herramienta presentará en pantalla los detalles exactos de cada mensaje antes de emitirlo (Destino, Monto, Payload en formato Cell Hex y Base64, Gas esperado).
   - El operador humano deberá confirmar manualmente cada transacción escribiendo `CONFIRM` en el terminal interactivo.
   - Tras el envío, la herramienta esperará la confirmación on-chain mediante llamada getter antes de habilitar el siguiente paso.
3. **Mecanismo de Desconexión / Aborto:**
   - Si cualquier verificación on-chain falla o supera un tiempo límite de 90 segundos, la herramienta debe pausar y emitir un diagnóstico completo sin enviar transacciones subsiguientes.

---

## 12. Dictamen Final

```
═══════════════════════════════════════════════════════════════════════════
DICTAMEN OFICIAL: APROBADO PARA REVISIÓN FINAL DEL PROCEDIMIENTO
═══════════════════════════════════════════════════════════════════════════
```

El ejecutor auditado (`deploy-launchpad-testnet-exec.js`) y los contratos asociados satisfacen rigurosamente los requerimientos de seguridad, aislamiento de secretos, inmutabilidad tras configuración y prevención de ejecución accidental en testnet o mainnet. El sistema se encuentra en un estado seguro y apto para diseñar y revisar el procedimiento de la futura sesión supervisada.

*Aviso formal: Este dictamen aprueba la preparación y revisión técnica del procedimiento. No autoriza la firma ni la transmisión de transacciones a la blockchain.*
