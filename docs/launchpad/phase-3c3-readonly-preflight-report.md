# ANLGRAM MemeLabs — Informe de Fase 3C.3: Preflight On-Chain de Solo Lectura y Reconciliación de Pruebas

**Fecha:** 29 de octubre de 2026  
**Rama:** `feature/launchpad-phase3c3`  
**Commit Auditado / Base:** `667fcc4` (`docs(launchpad): add Phase 3C.2 manual executor review report`)  
**Entorno de Trabajo:** Git Worktree aislado (`E:\anlgram-phase3c3`)  
**Herramienta de Preflight:** `minter-contract/deploy-launchpad-testnet-exec.js`  
**Dictamen Final:** `PREPARADO PARA REVISIÓN FINAL DEL PROCEDIMIENTO`  
*(Aviso imperativo: Este dictamen NO autoriza el despliegue on-chain, la firma ni la transmisión de transacciones).*

---

## 1. Estado del Repositorio y Entorno de Auditoría

En cumplimiento innegociable de las directivas de seguridad para la Fase 3C.3:

- **Worktree Aislado:** El trabajo se ejecutó íntegramente dentro de un árbol de trabajo independiente (`E:\anlgram-phase3c3`), desvinculado de las ramas productivas.
- **Ramas y Commits Base:**
  - Rama de trabajo: `feature/launchpad-phase3c3`
  - Commit HEAD base: `667fcc4`
  - Commits antecesores:
    - `43cf77f`: Fase 3C.1 (Herramienta de despliegue supervisado, inmutabilidad de router y configuración DEX v2.2)
    - `09913a2`: Fase 3C.0 (Testnet Readiness Gate)
- **Integridad de Producción y Git:**
  - La rama `main` no fue modificada, consultada para escritura ni fusionada.
  - Ningún archivo productivo del creador de Jettons o de la web pública fue alterado.
  - Cero operaciones de `git push`, `git merge` o mutación de historial.
  - Cero transacciones transmitidas, cero contratos desplegados y cero firmas criptográficas.
  - Cero claves privadas, frases mnemónicas o secretos solicitados, inspeccionados o guardados.

---

## 2. Tarea A: Reconciliación de Pruebas (Discrepancia entre 9 y 11 Pruebas)

### 2.1. Diagnóstico e Inspección Forense de Commits

Phase 3C.1 informó en su resumen `11 Pasadas` para `minter-contract/test-deploy-launchpad-testnet.js`, mientras que Phase 3C.2 informó `9 Pasadas` para el mismo archivo.

Se realizó una inspección exhaustiva de la historia de Git (`git log -p minter-contract/test-deploy-launchpad-testnet.js`):

1. **Creación en Commit `c09d2a9` (Fase 3A):**  
   El archivo fue creado con exactamente **9 bloques `test(...)`**:
   - `only safe preflight flags are accepted`
   - `mainnet and non-HTTPS endpoints are rejected`
   - `friendly testnet addresses validate checksum and testnet flag`
   - `network configuration validates explicit testnet only`
   - `missing config fails closed`
   - `dependency graph identifies synthetic cycles and confirms remediated DAG is acyclic`
   - `TON conversion is exact integer nanotons`
   - `test harness confirms it does not request a wallet signature or broadcast`
   - `read-only live checker uses GET only and labels its evidence as partial`

2. **Modificación en Commit `43cf77f` (Fase 3C.1):**  
   La única modificación realizada en el archivo fue la sustitución de la dirección del router obsoleto Candidate A (`kQALh...`) por la del router aprobado Candidate B (`kQAFp...`) en las líneas 22 y 44–45. **El número de pruebas permaneció idéntico: 9 pruebas**.

3. **Origen del Error en el Informe 3C.1:**  
   Al redactar el informe `phase-3c1-security-and-deployment-tool-report.md`, el autor elaboró la tabla resumen de 8 suites. La suite #2 (`test-router-candidates-tvm.js`) tenía y tiene exactamente 11 pruebas. Por un error clerical de transcripción (copia y pega involuntario), el autor duplicó el número `11` en la fila #5 (`minter-contract/test-deploy-launchpad-testnet.js`).

4. **Corrección en Fase 3C.2:**  
   En Fase 3C.2, el auditor ejecutó el archivo mediante el runner de Node.js (`node minter-contract/test-deploy-launchpad-testnet.js`), el cual arrojó su salida real: `tests 9, pass 9, fail 0`. El informe de Fase 3C.2 reflejó correctamente la cuenta empírica de 9 pruebas.

### 2.2. Re-ejecución Segura de la Suite Pertinente

Se ejecutó la suite local segura para certificar el resultado de forma incontrovertible:

```bash
node --test E:/anlgram-phase3c3/minter-contract/test-deploy-launchpad-testnet.js
```

**Resultado Exacto:**
```
✔ only safe preflight flags are accepted (1.7132ms)
✔ mainnet and non-HTTPS endpoints are rejected (0.4292ms)
✔ friendly testnet addresses validate checksum and testnet flag (0.5579ms)
✔ network configuration validates explicit testnet only (0.7948ms)
✔ missing config fails closed (0.2732ms)
✔ dependency graph identifies synthetic cycles and confirms remediated DAG is acyclic (2.0026ms)
✔ TON conversion is exact integer nanotons (0.8397ms)
✔ test harness confirms it does not request a wallet signature or broadcast (1.3737ms)
✔ read-only live checker uses GET only and labels its evidence as partial (1.1857ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 189.6924
```

### 2.3. Justificación de las Suites Omitidas en Fase 3C.2

Fase 3C.1 reportó 8 suites (354 pruebas reportadas, 352 reales corregidas), mientras que Fase 3C.2 ejecutó 6 suites (268 pruebas).

Las dos suites omitidas en Fase 3C.2 fueron:
1. **`test-master-security-audit.js` (51 pruebas):**  
   *Contenido:* Evalúa el motor de verificación de tokens en mainnet (`assets/js/token-verification-engine.js`), la integridad de hashes históricos de contratos minter principales de producción en mainnet y reconciliación de balances de usuarios en producción.  
   *Razón de la omisión:* Completamente ajena al nuevo launchpad testnet. Su ejecución evalúa la web productiva preexistente, fuera del alcance de la revisión manual del ejecutor.
2. **`test-anl-labs-regression.js` (33 pruebas):**  
   *Contenido:* Evalúa la renderización de elementos HTML del DOM, componentes de UI y estilos visuales de las páginas web (`memecoin-platform.html`, `index.html`, modales de frontend).  
   *Razón de la omisión:* Pruebas de interfaz web de usuario. Fase 3C.2 fue una auditoría técnica del backend CLI de despliegue (`deploy-launchpad-testnet-exec.js`) y de la seguridad de contratos TVM; la capa visual de navegador no intervenía en el ejecutor.

---

## 3. Tarea B y D: Preflight On-Chain de Solo Lectura e Integridad del Ejecutor

### 3.1. Arquitectura y Capacidades de Solo Lectura Implementadas

Se extendió `minter-contract/deploy-launchpad-testnet-exec.js` incorporando las funciones:
- `queryAccountStatusReadOnly(address, env, fetchImpl)`: Consulta de estado de cuentas vía API oficial REST de TON (`TonAPI v2` y `Toncenter v2`).
- `verifyDeterministicAddressesOnChainReadOnly(predictedAddresses, env, fetchImpl)`: Auditoría integral de las 4 direcciones deterministas, la billetera operadora y los contratos del DEX.
- `printOnChainPreflight(onchain)`: Renderización estructurada de la evidencia con clasificación unívoca de estados.

### 3.2. Taxonomía de Estados y Principio *Fail-Closed*

El preflight clasifica cada cuenta según la respuesta fáctica del nodo TON:

| Categoría Preflight | Estado Retornado por Proveedor | Código / Data en Blockchain | Interpretación para Despliegue | Acción del Preflight |
|---|---|---|---|---|
| **`UNINITIALIZED`** | `nonexist` (TonAPI) o `uninitialized` (Toncenter) | Cero bytecode (`code == ""`) | Dirección completamente libre y virgen. Apta para recibir el StateInit correspondiente. | **Aceptada** para despliegue. |
| **`ALREADY_ACTIVE`** | `active` | Contrato desplegado con bytecode (`code != ""`) | La dirección ya posee un contrato activo. En la TVM de TON, enviar un StateInit a una cuenta activa es ignorado y causará colisión o fallo de inicialización. | **BLOQUEA** despliegue (`INTERVENTION_REQUIRED`). |
| **`FROZEN`** | `frozen` | Hash congelado | La cuenta fue congelada (por falta de storage rent o consenso). No operable normalmente. | **BLOQUEA** despliegue (`INTERVENTION_REQUIRED`). |
| **`INCOMPATIBLE`** | `uninitialized` | Código presente (`code != ""`) | Estado anómalo o corrupto. | **BLOQUEA** despliegue (`INTERVENTION_REQUIRED`). |
| **`INDETERMINATE`** | HTTP 429, 500, timeout, error de red o JSON malformado | No verificable | **El preflight NUNCA asume que una consulta fallida significa cuenta vacía**. Una respuesta HTTP no-200 o un error de red impide conocer el estado. | **BLOQUEA** despliegue (`INDETERMINATE`). |

### 3.3. Comprobación Estricta de Red y Endpoints

Antes de emitir cualquier petición HTTP:
1. Valida que `TON_NETWORK === 'testnet'` y `TON_GLOBAL_ID === '-3'`.
2. Valida que el host pertenezca exclusivamente a la lista blanca autorizada (`testnet.toncenter.com`, `testnet.tonapi.io`).
3. Valida protocolo `https:`. Endpoints `http:` o de dominios no autorizados son rechazados con `FORBIDDEN_ENDPOINT`.
4. Valida que la dirección a consultar cuente con el flag friendly testnet (`kQ...`). Direcciones de mainnet (`EQ...`) son rechazadas antes de salir a la red (`MAINNET_ADDRESS_REJECTED`).
5. Todas las consultas son estrictamente de tipo `GET`, sin cuerpo (`body: undefined`), garantizando cero mutaciones.

---

## 4. Tarea C: Reproducibilidad Criptográfica de Direcciones

### 4.1. Parámetros de Derivación

Las 4 direcciones deterministas del launchpad se calculan exclusivamente a partir de la fórmula matemática pura de la TVM:
$$\text{Address} = \text{contractAddress}\big(\text{workchain}=0, \{\text{code}: \text{codeCell}, \text{data}: \text{dataCell}\}\big)$$

1. **Billetera Operadora (Deployer):**
   - Dirección pública completa: `kQBzQx6SZa94aoiJFfaHPV-cJ1EV-Y74djNEKwv1Z5GOn06-`
   - Formato raw: `0:73431e9265af786a888915f6873d5f9c275115f98ef87633442b0bf567918e9f`
   - No se utiliza ni se requiere ninguna clave privada para el cálculo.
2. **Artefactos Compilados Aprobados:**
   - Bytecodes BOC verificados bit a bit con los hashes SHA256 de `build/*.compiled.json`.
3. **Infraestructura Externa Inmutable:**
   - STON.fi Router v2.2 (Candidate B): `kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn`
   - pTON v2 Master: `kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px`
4. **Grafo Topológico Acyclic:**
   - $\text{Minter} \longrightarrow \text{Bonding Curve} \longrightarrow \text{LP Locker} \longrightarrow \text{Migration Router}$

### 4.2. Tabla de Direcciones, Hashes y Estado On-Chain Auditado en Vivo

La siguiente tabla presenta los resultados de la consulta en vivo realizada contra los endpoints oficiales de TON testnet:

| Contrato | Dirección Determinista (`testnet friendly`) | Dirección Raw (Workchain 0) | Hash Celda de Código (`codeCellHash`) | Hash SHA256 de BOC | Estado en Testnet | Bytecode en Testnet | Balance On-Chain | Veredicto Preflight |
|---|---|---|---|---|---|---|---|---|
| **Launchpad Jetton Master** | `kQCUd7-PNHWoT2uihm-DGhHtUxLgwxX-ngdc9-P7g_pV0nV8` | `0:9477bf8f3475a84f6ba2866f831a11ed5312e0c315fe9e075cf7e3fb83fa55d2` | `90b5069f199fcea56ef467dd25cf8420c5e9848ba0fcc0cc139424c5cac17aec` | `92b25bfa090b89cdb453f50ae268c53dbae87ffffdb7e15b99e9bc9396ef2a00` | `nonexist` / `uninitialized` | Ninguno (0 bytes) | 0.0000 TON | **CLEAN / UNINITIALIZED** |
| **Bonding Curve** | `kQCI_yYs83HPyPrL6HQVTyeY3AOG3zzovN1JAAjfcWgNLvzm` | `0:88ff262cf371cfc8facbe874154f2798dc0386df3ce8bcd490008df71680d2ef` | `dae0ca19cd71c54fd4bbf90e545f1de38c66bc5de7ad5bdc37eaa8dd8ea62eae` | `f9d62f52d4ccb71fd95d93d9fe57d961e37165159e456b55aa0c9a9a48f12797` | `nonexist` / `uninitialized` | Ninguno (0 bytes) | 0.0000 TON | **CLEAN / UNINITIALIZED** |
| **LP Locker** | `kQBqMWD-mAjFIhN4RfUayVSYfJOeDiemRNQIlyo8Xtx5xjeH` | `0:aa3160fe9808c522137845f51ac954987c939e0e27a644d408972a3c5edc79c6` | `e9da326d9ad2ec259112743a2e581fc5783693e9ee2d7371e5ff249bcaf97536` | `36ac2eaf0c360eb795984a4a0d7d94eaf6d9e2f3fe37178cc7285c90901dcb6a` | `nonexist` / `uninitialized` | Ninguno (0 bytes) | 0.0000 TON | **CLEAN / UNINITIALIZED** |
| **Migration Router** | `kQDS4rD_RbXYRjT_6HXFOUwA2KfyAgi5NVM6GdYLRXskoI3L` | `0:d2e2b0ff45b5d84634ffe875c5394c00d8a7f20208b935533a19d60b457b24a0` | `ad789269bb790232a0fcb7a4c711099e295496298db9b1fdeaac65ada26ef844` | `35c57ebf83cb11dd2c7b6801437ba5d25efdae8912accaea632210071dda2139` | `nonexist` / `uninitialized` | Ninguno (0 bytes) | 0.0000 TON | **CLEAN / UNINITIALIZED** |
| **Deployer Wallet** | `kQBzQx6SZa94aoiJFfaHPV-cJ1EV-Y74djNEKwv1Z5GOn06-` | `0:73431e9265af786a888915f6873d5f9c275115f98ef87633442b0bf567918e9f` | N/A (Standard Wallet V4R2) | N/A | `nonexist` / `uninitialized` | Ninguno | 0.0000 TON | **INTERVENCIÓN REQUERIDA (Saldo < 2.71 TON)** |
| **STON.fi Router v2.2** | `kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn` | `0:05a5e18525003d2aa882c5767c27897ffef4980311528ab48ebcf1e7e92497e3` | N/A (DEX Release Bytecode) | N/A | `active` | Presente | 2.1036 TON | **ACTIVO (Listo para recibir liquidez)** |
| **pTON v2 Master** | `kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px` | `0:0092df40d7a1443b35f0293efce1ede066499f4be32809fa590d5ad6daf13413` | N/A (pTON v2 Release Bytecode) | N/A | `active` | Presente | 13.1987 TON | **ACTIVO (Listo para envolver TON)** |

---

## 5. Tarea E: Resultados de la Suite Completa de Pruebas

Se añadieron 11 nuevas pruebas unitarias y de integración de solo lectura en `minter-contract/test-deploy-launchpad-testnet-exec.js`, elevando su total de 23 a 34 pruebas.

### Tabla Consolidada de Pruebas Ejecutadas

| Suite de Prueba | Archivo de Prueba | Pruebas Pasadas | Pruebas Fallidas | Estado | Cobertura Funcional |
|---|---|---|---|---|---|
| **Preflight On-Chain & Seguridad del Ejecutor** | `minter-contract/test-deploy-launchpad-testnet-exec.js` | 34 | 0 | **PASADA (100%)** | Detección de cuentas activas, congeladas, incompatibles, errores 429, timeouts, rechazo mainnet, balance insuficiente, y validación de sólo lectura GET. |
| **Simulación TVM Contratos** | `test-bonding-curve-tvm.js` | 154 | 0 | **PASADA (100%)** | Bytecode real TVM: minter renounce, LP locker anti-front-running, AMM math, anti-drain, STON.fi v2.2 routing, inmutabilidad de router. |
| **Candidatos de Router DEX** | `test-router-candidates-tvm.js` | 11 | 0 | **PASADA (100%)** | Falla de Candidato A (CPI v2.1.0), compatibilidad estricta de Candidato B (DEX v2.2), incompatibilidad de Candidato C (v1). |
| **Matemáticas Curva AMM** | `minter-contract/test-bonding-curve-math.js` | 46 | 0 | **PASADA (100%)** | Fórmulas de producto constante, solvencia de reservas, tarifas 1%, graduación a 500 TON, 12,000 iteraciones de fuzzing aleatorio. |
| **Validación Preflight Despliegue** | `minter-contract/test-deploy-launchpad-testnet.js` | 9 | 0 | **PASADA (100%)** | Parsing de flags preflight, rechazo mainnet, validación CRC16 de direcciones, DAG sin ciclos, conversión de nanotons. |
| **Proveedor Blockchain** | `test-blockchain-provider.js` | 25 | 0 | **PASADA (100%)** | Failover automático TonAPI/Toncenter, manejo de 429, aislamiento de red. |
| **TOTAL GENERAL** | **6 Suites de Prueba** | **279** | **0** | **100% ÉXITO** | **Verificación completa de lógica local y abstracciones on-chain.** |

---

## 6. Fallos, Riesgos y Limitaciones del Preflight

1. **Naturaleza Estática vs. Dinámica del Preflight:**  
   El preflight de solo lectura certifica la fotografía actual del ledger en la blockchain. No previene que, en el intervalo entre la ejecución del preflight y la sesión supervisada, ocurra una transacción externa si la misma semilla fuera utilizada concurrentemente (lo cual está prohibido).
2. **Límites de Peticiones en Endpoints Públicos (HTTP 429):**  
   Durante las pruebas contra `https://testnet.toncenter.com/api/v2` sin API Key se registraron respuestas `HTTP 429 Ratelimit exceed`. El ejecutor demostró satisfactoriamente que clasifica el HTTP 429 como `INDETERMINATE` y detiene el proceso inmediatamente sin asumir desocupación. Para la sesión futura, se debe utilizar una clave de API válida (`TONCENTER_API_KEY` o `TONAPI_KEY`).
3. **No Equivalencia entre HTTP 200 y Éxito On-Chain:**  
   Una respuesta HTTP 200 de un indexador solo confirma que el indexador contestó con éxito a la consulta, no que el contrato esté listo. El contenido del payload (`state`, `code`, `balance`) es lo único vinculante.
4. **Saldo Cero de la Billetera Operadora:**  
   La consulta on-chain confirmó que `ANLGRAM_TESTNET_DEPLOYER_ADDRESS` (`kQBzQx6S...`) tiene un saldo actual de **0.0000 TON**. Esta condición fue capturada por la compuerta de solvencia financiera como un `BLOCKER` insoslayable.

---

## 7. Distinción Rigurosa: Preflight vs. Despliegue vs. Validación E2E

Es vital delimitar conceptualmente el alcance de cada fase:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. PREFLIGHT ON-CHAIN (Fase Actual 3C.3)                                               │
│    - Modo 100% Solo Lectura (GET).                                                     │
│    - Cero firmas, cero gas gastado, cero transacciones.                                │
│    - Demuestra que las 4 direcciones deterministas están libres (nonexist).            │
│    - Demuestra que los routers DEX de testnet están activos y operables.               │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. DESPLIEGUE SUPERVISADO (Futura Fase 3D)                                             │
│    - Sesión interactiva con billetera financiada (>= 3.50 TON).                         │
│    - Aprobación humana explícita ('CONFIRM') por cada mensaje individual.              │
│    - Firma externa y emisión secuencial de los 4 StateInit y 4 bootstraps.             │
│    - Polling on-chain por cada bloque hasta confirmar 'active' y exit_code: 0.         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. VALIDACIÓN ON-CHAIN E2E (Fase 3E)                                                   │
│    - Interacción de trading real en testnet con billeteras de prueba.                  │
│    - Compras y ventas a lo largo de la curva.                                          │
│    - Acumulación de los 500 TON reales mediante compras.                               │
│    - Activación de la graduación, migración al router v2.2 y bloqueo en LP Locker.     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Requisitos Pendientes antes de Autorizar una Futura Ejecución

Antes de autorizar la apertura de una sesión interactiva de despliegue supervisado (Fase 3D), se exige el cumplimiento de los siguientes prerrequisitos:

1. **Aprovisionamiento Financiero de la Wallet Operadora:**  
   Financiar la dirección pública `kQBzQx6SZa94aoiJFfaHPV-cJ1EV-Y74djNEKwv1Z5GOn06-` con al menos **3.50 TON** en testnet utilizando el faucet oficial (`@testgiver_ton_bot`).
2. **Provisión de API Key de Testnet:**  
   Obtener e inyectar `TONCENTER_API_KEY` o `TONAPI_KEY` en el entorno seguro de ejecución para evitar rate limits durante el sondeo interactivo.
3. **Mantenimiento del Aislamiento de Claves:**  
   El procedimiento de ejecución debe realizar la firma a través de un mecanismo desacoplado (firmador local en memoria o hardware wallet interactivo), sin almacenar la frase semilla en variables de entorno permanentes ni argumentos CLI.
4. **Aprobación del Procedimiento Paso a Paso:**  
   Formalizar la pauta de control que presentará cada mensaje, su payload serializado en BOC Base64/Hex y el gas reservado, exigiendo el consentimiento manual del operador antes de continuar.

---

## 9. Dictamen Final

```
═══════════════════════════════════════════════════════════════════════════
DICTAMEN OFICIAL: PREPARADO PARA REVISIÓN FINAL DEL PROCEDIMIENTO
═══════════════════════════════════════════════════════════════════════════
```

El preflight on-chain de solo lectura ha demostrado de manera concluyente e irrefutable que:
1. Las 4 direcciones deterministas del launchpad están completamente limpias, desocupadas (`nonexist` / `uninitialized`) y listas para el despliegue de sus respectivos StateInit.
2. Los contratos de infraestructura externa (STON.fi DEX v2.2 y pTON v2 Master) están desplegados, activos y fondeados en TON testnet.
3. La discrepancia entre 9 y 11 pruebas ha quedado documentada y resuelta con precisión forense.
4. El ejecutor opera exclusivamente en modo de solo lectura, con fallos cerrados ante cualquier error o estado indeterminado y sin capacidad de transmitir transacciones.
5. El sistema se encuentra en estado técnico óptimo para la revisión y aprobación formal del procedimiento interactivo de despliegue.

*Aviso formal: Este dictamen aprueba la preparación y revisión final del procedimiento. No autoriza el despliegue, la firma ni la transmisión de transacciones a la blockchain.*
