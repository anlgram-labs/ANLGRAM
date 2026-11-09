# ANLGRAM MEMELABS — INDEPENDENT PRODUCTION READINESS & SECURITY AUDIT
**Document Reference:** `ANL-AUDIT-MEMELABS-2026-01`  
**Target Repository:** `E:\ANLGRAM` (`feature/launchpad-engine`)  
**Audit Worktree:** `E:\anlgram-memelabs-audit` (commit `c09d2a9`)  
**Auditor:** Independent Web3 Security, Software Quality & TON Connect Systems Auditor  
**Date of Audit:** October 28, 2026  
**Scope:** `memecoin-platform.html`, `assets/js/anl-labs.js`, `assets/js/launchpad.js`, `assets/js/wallet-connect.js`, `assets/js/web3-integration.js`, `assets/js/security.js`, `assets/js/token-verification-engine.js`, `assets/js/api.js`, `minter-contract/contracts/`, and associated test suites.

---

## 1. RESUMEN EJECUTIVO (EXECUTIVE SUMMARY)

### 1.1 Veredicto General de Preparación
* **Estado para Producción (Mainnet):** **NO APTO PARA PRODUCCIÓN (NOT PRODUCTION READY)**.
* **Estado para Piloto Experimental (Testnet):** **PARCIALMENTE APTO CON RESTRICCIONES CRÍTICAS**.

El análisis estricto e independiente del código de **ANLGRAM MemeLabs** demuestra la existencia de una **desconexión arquitectónica fundamental** entre el motor de contratos inteligentes (`minter-contract/`) y la interfaz de usuario web (`memecoin-platform.html`):

1. **Ausencia de Interfaz de Trading para Bonding Curve:** Mientras que la suite de contratos en FunC (`anlgram-bonding-curve.fc`, `anlgram-migration-router.fc`, `anlgram-lp-locker.fc`) se encuentra remediada, libre de dependencias circulares y validada a nivel matemático y de simulador local de máquina virtual (TVM), **la interfaz web de MemeLabs carece por completo de widgets, formularios o llamadas Web3 para comprar o vender tokens en la curva de vinculación**. La pestaña de *Launchpad* se limita a un formulario de creación de Jettons y no implementa operaciones `op::buy_tokens` ni `op::sell_tokens`.
2. **Custodia y Provisión de Liquidez Simulada por Redirección:** La función de liquidez en el frontend (`provideLiquidityWeb3`) no interactúa con el router de migración on-chain ni con el bloqueador de liquidez (LP Locker). Se limita a abrir una pestaña externa hacia STON.fi o DeDust, evadiendo la arquitectura descentralizada de custodia programada en el motor.
3. **Inyección de Métricas y Saldos Ficticios en la Experiencia de Usuario:** Al conectar cualquier wallet real a través de TON Connect, el frontend inyecta dinámicamente un pool simulado (`TON-NewToken`, dirección `EQCa...XyZ1`, saldos de `145.20 TON` y `1.5M TKN`, con un PnL de `+45.20 USD`), induciendo a error al usuario haciéndole creer que posee liquidez activa.
4. **Vulnerabilidades y Políticas de Seguridad Web Permisivas:** La política de seguridad de contenido (CSP) autoriza `'unsafe-inline'` y `'unsafe-eval'`, y carga dependencias críticas desde redes CDN públicas (`unpkg.com`, `cdn.jsdelivr.net`, `esm.sh`) sin hashes de Integridad de Subrecursos (SRI).
5. **Ceguera ante Transacciones Rebotadas (Bounced Messages):** Los bucles de sondeo en el cliente no inspeccionan si una transacción falló con el flag `is_bounced: true` en el trace de TVM, catalogando erróneamente un fallo de ejecución como un simple tiempo de espera agotado ("timeout").
6. **Mecanismos Implementados Según Estándares (Sin Validación On-Chain en Esta Auditoría):** Por el contrario, la creación estándar de Jettons TEP-74 (`deployJettonWeb3`), la renuncia irreversible de administración (`renounceAdminWeb3`), la acuñación controlada (`mintMoreTokensWeb3`), la validación de direcciones TON (`isValidTonAddress`), y la protección preventiva que bloquea el vesting en Mainnet (`labsSubmitVesting`) están implementados de forma coherente con los estándares TEP-74/TEP-64 según la inspección de código y las pruebas locales de regresión. **En esta auditoría no se obtuvo evidencia on-chain propia** (no se desplegó ningún contrato ni se firmó o transmitió ninguna transacción), por lo que todas estas funciones se clasifican como `IMPLEMENTADA, PERO NO VERIFICADA` (o `DESHABILITADA POR SEGURIDAD` en el caso de vesting en Mainnet). Ver sección 4.5.

---

## 2. INVENTARIO FUNCIONAL CON ESTADO Y EVIDENCIA (FUNCTIONAL INVENTORY)

Cada función fue evaluada bajo los criterios estrictos del mandato, distinguiendo la presencia cosmética en la interfaz de usuario, la implementación verificada solo mediante inspección de código o pruebas locales, y la ejecución real en la blockchain de TON.

> [!IMPORTANT]
> **Criterio estricto de clasificación:** Ninguna función se clasifica como `FUNCIONA CON EVIDENCIA VERIFICABLE` en este informe porque durante esta auditoría no se ejecutaron despliegues ni transacciones reales en la blockchain de TON (0 transacciones firmadas o transmitidas). Toda función cuya evidencia proviene únicamente de inspección de código, pruebas unitarias, compilación, simulaciones locales de TVM o pruebas de interfaz en memoria se clasifica como **`IMPLEMENTADA, PERO NO VERIFICADA`**. Se conservan las categorías `SOLO VISUAL / SIMULADA`, `PENDIENTE` y `DESHABILITADA POR SEGURIDAD` donde corresponden a la evidencia.

| Módulo / Función | Clasificación | Archivo y Ubicación | Evidencia Técnica (Inspección Local / Simulación) y Comportamiento Analizado |
| :--- | :--- | :--- | :--- |
| **Creación Estándar de Jetton (TEP-74 Direct Deploy)** | **IMPLEMENTADA, PERO NO VERIFICADA** | `memecoin-platform.html` L1446-L1620; `anl-labs.js` L570-L620 | **Evidencia: inspección de código y pruebas locales de interfaz/serialización BoC (sin ejecución on-chain en esta auditoría).** Construye diccionario de metadatos TEP-64, carga bytecode canónico TEP-74 (`9a0f98dd...`), calcula `StateInit` y dirección determinista, prepara solicitud TON Connect con 2 mensajes (0.05 TON deploy + 0.15 TON mint) e incluye bucle de sondeo `get_jetton_data`. |
| **Creación de Jetton vía Factory** | **PENDIENTE** | `assets/js/launchpad.js` L23-L24, L116-L154, L188-L193 | `FACTORY_TESTNET` y `FACTORY_MAINNET` están vacíos (`''`). `buildFactoryTransaction` lanza excepción por falta de contrato y redirige silenciosamente a `directDeploy`. |
| **Conexión de Wallet (TON Connect v2)** | **IMPLEMENTADA, PERO NO VERIFICADA** | `assets/js/wallet-connect.js` L1-L250; `memecoin-platform.html` L318-L321 | **Evidencia: inspección de código y pruebas locales con instancia `tonConnectUI` simulada (sin emparejamiento de wallet en vivo en esta auditoría).** Instancia `@tonconnect/ui@2.0.8`, enlaza manifiesto HTTPS, gestiona eventos `anlgramWalletChanged` e identifica cadena (`-239` Mainnet vs `-3` Testnet). |
| **Launchpad — Formulario de Creación** | **IMPLEMENTADA, PERO NO VERIFICADA** | `memecoin-platform.html` L400-L550, `assets/js/anl-labs.js` L200-L350 | **Evidencia: inspección de código y pruebas locales de DOM/VM.** Sincroniza campos entre el wizard unificado y la vista clásica. Valida datos de entrada y formatos de imagen (bloqueo de `data:URI` para cumplimiento TEP-64). |
| **Bonding Curve — Trading On-Chain (Buy/Sell)** | **PENDIENTE** | N/A en Frontend; contratos en `minter-contract/contracts/anlgram-bonding-curve.fc` | **Cero integración en frontend.** No existe UI para trading de Bonding Curve ni llamadas a `op::buy_tokens` o `op::sell_tokens`. El contrato existe y pasa 97 pruebas de simulación local TVM, pero no está conectado a la web ni desplegado. |
| **Distribución Masiva Multi-Wallet** | **IMPLEMENTADA, PERO NO VERIFICADA** | `assets/js/anl-labs.js` L800-L1050 (`labsExecuteDistributionBatch`) | **Evidencia: inspección de código y pruebas locales de flujo en VM con wallet simulada.** Resuelve wallet Jetton vía TonAPI, segmenta hasta 4 transferencias TEP-74 (`0x0f8a7ea5`) por lote TON Connect con gas de 0.05 TON por mensaje, valida direcciones y permite reanudar lotes pendientes. |
| **Vesting y Bloqueo de Tokens — Mainnet** | **DESHABILITADA POR SEGURIDAD** | `assets/js/anl-labs.js` L1388-L1397 (`labsSubmitVesting`) | Bloqueo activo intencional verificado en código y pruebas locales. Emite alerta informativa indicando que el contrato está en proceso de auditoría formal e impide cualquier transacción de bloqueo en Mainnet. |
| **Vesting y Bloqueo de Tokens — Testnet** | **IMPLEMENTADA, PERO NO VERIFICADA** | `assets/js/anl-labs.js` L1480-L1620 (`labsSubmitVesting`) | **Evidencia: inspección de código, simulación local TVM del contrato y pruebas de interfaz (sin despliegue ni bloqueo real en Testnet en esta auditoría).** Construye `StateInit` de `anlgram-vesting-wallet`, empaqueta 2 mensajes TON Connect (0.05 TON deploy + 0.08 TON TEP-74 transfer) e incluye sondeo de activación. |
| **Custodia de Liquidez (LP Locker On-Chain)** | **PENDIENTE** | N/A en Frontend; contrato en `minter-contract/contracts/anlgram-lp-locker.fc` | El contrato de bloqueo permanente pasa la simulación local en TVM (`0x414e4c39`), pero el frontend no tiene interfaz ni disparadores para consultar o gestionar bloqueos de LP tokens. |
| **Renuncia de Administración (Renounce Admin)** | **IMPLEMENTADA, PERO NO VERIFICADA** | `memecoin-platform.html` L2213-L2350; `anl-labs.js` L1780-L1840 | **Evidencia: inspección de código, serialización local BoC y simulación TVM (sin transacción real on-chain en esta auditoría).** Prepara transacción TON Connect con `op::change_admin (0x03)` y `admin_address = null` (`addr_none`), e incluye bucle de sondeo `get_jetton_data` para comprobar `admin == null`. |
| **Quema de Tokens (Token Burn)** | **IMPLEMENTADA, PERO NO VERIFICADA** | `assets/js/anl-labs.js` L2334-L2460 (`burnTokensWeb3`) | **Evidencia: inspección de código y prueba local de serialización BoC sin broadcast.** Construye mensaje TEP-74 `op::burn (0x595f07bc)` hacia la Jetton Wallet del usuario, valida saldo/decimales e incluye sondeo de saldo. |
| **Acuñación Adicional de Tokens (Mint More)** | **IMPLEMENTADA, PERO NO VERIFICADA** | `memecoin-platform.html` L2141-L2210 (`mintMoreTokensWeb3`) | **Evidencia: inspección de código y pruebas locales de regresión (sin transacción real on-chain en esta auditoría).** Verifica en cliente que el emisor coincida con el admin, construye mensaje `op::mint (21)` con internal transfer, invoca TON Connect e incluye sondeo de `total_supply`. |
| **Provisión de Liquidez en DEX** | **SOLO VISUAL / SIMULADA (REDIRECT)** | `memecoin-platform.html` L2095-L2139 (`provideLiquidityWeb3`) | Abre `https://app.ston.fi/liquidity/provide` o `https://dedust.io/pools/create` en una pestaña nueva del navegador. No ejecuta llamadas a routers on-chain ni custodia liquidez. |
| **Métricas y Analítica de Tokens** | **IMPLEMENTADA, PERO NO VERIFICADA** | `assets/js/anl-labs.js` L2465-L2600 (`labsLoadTokenAnalytics`) | **Evidencia: inspección de código y pruebas locales.** Consulta TonAPI para recuperar metadatos, suministro total, lista de holders y volumen indexado. |
| **Gráfico de Crecimiento de Tokens** | **SOLO VISUAL / SIMULADA** | `memecoin-platform.html` L1822-L1845 | Gráfico renderizado con Chart.js alimentado por un array estático quemado en código: `[120, 190, 150, 220, 310, 480, 520]`. No refleja métricas reales. |
| **Sondeo y Confirmación de Transacciones** | **IMPLEMENTADA, PERO NO VERIFICADA** | Bucles de sondeo en `memecoin-platform.html` y `anl-labs.js` | **Evidencia: inspección de código y pruebas locales con mocks.** Efectúa hasta 20 reintentos cada 3 segundos contra TonAPI. No detecta mensajes rebotados (`is_bounced: true`), reportando falsos timeouts cuando una transacción falla. |
| **Lectura de Exploradores y Redes** | **IMPLEMENTADA, PERO NO VERIFICADA** | `assets/js/anl-labs.js` L160-L195 (`getNetworkContext`) | **Evidencia: inspección de código y pruebas unitarias/de interfaz locales.** Genera enlaces dinámicos a Tonviewer y Tonscan y selecciona endpoints según la red detectada (Mainnet vs Testnet). |
| **Avisos de Seguridad y Diálogos de Confirmación** | **IMPLEMENTADA, PERO NO VERIFICADA** | Modales en `memecoin-platform.html` y `anl-labs.js` | **Evidencia: inspección de código y pruebas locales de DOM/VM.** Modales con verificación explícita mediante checkbox para renuncia de admin, quema de tokens y advertencia sobre imágenes locales en TEP-64. |

---

## 3. HALLAZGOS CLASIFICADOS POR SEVERIDAD (FINDINGS BY SEVERITY)

### 3.1 Hallazgos Críticos (Severity: Critical)

#### [SEC-CRIT-01] Ausencia Total de Interfaz Web para el Motor de Bonding Curve
* **Módulo Afectado:** `memecoin-platform.html`, `assets/js/launchpad.js`, `assets/js/anl-labs.js`.
* **Descripción:** Los contratos inteligentes `anlgram-bonding-curve.fc`, `anlgram-migration-router.fc` y `anlgram-lp-locker.fc` compilan localmente y superan las 97 pruebas de simulación local TVM. Sin embargo, en la interfaz web de MemeLabs no existe ningún elemento que permita comprar (`op::buy_tokens` `0x414e4c02`), vender (`op::sell_tokens` `0x414e4c03`), consultar el progreso de la curva hacia la graduación (500 TON) ni visualizar el precio spot calculado. La pestaña denominada "Launchpad" ejecuta únicamente la creación estática de un Jetton estándar TEP-74.
* **Impacto:** El producto no puede operar como un Launchpad de curva de vinculación descentralizado (estilo Pump.fun / GasPump). El usuario final no tiene vía para interactuar con los contratos del motor desde la web.
* **Remediación Requerida:** Desarrollar e integrar en `memecoin-platform.html` los componentes de interfaz para: (a) visualización de la curva con fórmula de producto constante, (b) formulario interactivo de compra y venta con cálculo de deslizamiento (slippage), y (c) despacho de transacciones TON Connect con los opcodes exactos del contrato.

---

### 3.2 Hallazgos Altos (Severity: High)

#### [UX-HIGH-01] Inyección de Pool de Liquidez y Saldos Ficticios al Conectar Wallet
* **Módulo Afectado:** `memecoin-platform.html` L2406-L2440.
* **Descripción:** Dentro del manejador del evento `anlgramWalletChanged`, el código contiene un bloque explícitamente documentado como `// Mocking the user's pools exactly like the screenshot`:
  ```javascript
  // memecoin-platform.html:2406
  poolsList.innerHTML = `
    ...
    <div style="color:#fff; font-weight:700; font-size:16px;">TON-NewToken</div>
    <div style="color:var(--text-muted); font-size:11px; font-family:monospace;">EQCa...XyZ1</div>
    ...
    <div>TON 145.20</div>
    <div>TKN 1.5M</div>
    <div>+45.20 USD (31%)</div>
  `;
  ```
* **Impacto:** Cualquier usuario que conecte una wallet real ve de inmediato un pool inexistente con fondos ficticios (`145.20 TON` y `1.5M TKN`). Esto genera una falsedad de estado crítica, induciendo al usuario a creer que posee liquidez activa en el protocolo.
* **Remediación Requerida:** Eliminar de inmediato el bloque estático. Reemplazarlo por una consulta real a TonAPI (`/accounts/{address}/jettons`) y a los registros de STON.fi v2. Si el usuario no tiene posiciones LP activas, mostrar un estado vacío genuino ("No active liquidity pools found").

#### [SEC-HIGH-02] Política de Seguridad de Contenido (CSP) Permisiva y Ausencia de SRI
* **Módulo Afectado:** `memecoin-platform.html` L8.
* **Descripción:** La directiva CSP define:
  ```html
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net https://d3js.org https://esm.sh https://cdn.emailjs.com https://telegram.org; ...">
  ```
  Adicionalmente, librerías críticas para transacciones criptográficas (`@tonconnect/ui@2.0.8`, `chart.js@4.4.0`) son importadas directamente de `unpkg.com` y `cdn.jsdelivr.net` sin los atributos `integrity="sha384-..."` ni `crossorigin="anonymous"`.
* **Impacto:** La inclusión de `'unsafe-eval'` y `'unsafe-inline'` inhabilita las defensas nativas del navegador contra Cross-Site Scripting (XSS). Si un script de un CDN público se ve comprometido o interceptado, un atacante podría ejecutar código arbitrario con acceso a las sesiones de TON Connect.
* **Remediación Requerida:** Alojar localmente las librerías o fijar versiones estrictas con hashes de Integridad de Subrecursos (SRI). Eliminar `'unsafe-eval'` y migrar los controladores en línea (`onclick="..."`) a escuchadores de eventos estructurados (`addEventListener`).

#### [ARCH-HIGH-03] Desconexión de la Provisión de Liquidez respecto al LP Locker
* **Módulo Afectado:** `memecoin-platform.html` L2095-L2139 (`provideLiquidityWeb3`).
* **Descripción:** El botón de provisión de liquidez ejecuta una redirección externa vía `window.open` a la interfaz web de STON.fi o DeDust. No interactúa con `anlgram-migration-router.fc` ni con `anlgram-lp-locker.fc`.
* **Impacto:** La liquidez no queda bloqueada bajo las reglas programáticas del protocolo ANLGRAM. El creador del token retiene los LP tokens en su wallet personal sin custodia forzada, lo que contradice el modelo "Anti-Rugpull" prometido por la plataforma.
* **Remediación Requerida:** Conectar el flujo de graduación del Bonding Curve con el `Migration Router` on-chain, garantizando que los LP tokens generados sean transferidos obligatoriamente al `LP Locker` (`0x414e4c39`).

---

### 3.3 Hallazgos Medios (Severity: Medium)

#### [UX-MED-01] Indiferenciación de Transacciones Rebotadas (Bounced Messages)
* **Módulo Afectado:** `memecoin-platform.html` L1590-L1615, L2290-L2340; `assets/js/anl-labs.js` L950-L1020, L1590-L1610.
* **Descripción:** En la arquitectura asíncrona de TON, los mensajes internos con flag de rebote activado rebotan hacia el remitente si la transacción de cómputo en el contrato de destino falla (p. ej., por falta de gas o código de salida 401/403). La interfaz de MemeLabs únicamente sondea si el estado cambió; si el contrato no se inicializó o el estado no cambió en 60 segundos, la interfaz asume un "Timeout" o muestra una advertencia de verificación pendiente, sin inspeccionar el campo `bounced: true` en el trace de la transacción.
* **Impacto:** Los usuarios no reciben retroalimentación precisa cuando una transacción es rechazada por las reglas lógicas del contrato, asumiendo erróneamente que la red está congestionada.
* **Remediación Requerida:** Inspeccionar los eventos de la cuenta a través de `/accounts/{address}/events` o `/blockchain/transactions/{hash}` y analizar si los mensajes salientes generaron un mensaje rebotado con código de error TVM.

#### [ARCH-MED-02] Direcciones de Contratos Factory Vacías con Fallback Silencioso
* **Módulo Afectado:** `assets/js/launchpad.js` L22-L39, L188-L193.
* **Descripción:** Las variables `FACTORY_TESTNET` y `FACTORY_MAINNET` se encuentran configuradas como cadenas vacías (`''`). Cuando un usuario invoca `deployViaFactory`, el código detecta la dirección vacía y activa una ruta de fallback hacia `directDeploy`:
  ```javascript
  // launchpad.js:189
  if (!quote.factoryAddress) {
    showProgress(btn, 1, 'Factory not deployed — direct deploy (no fee)...');
    await directDeploy(btn, origHTML, tc, name, symbol, desc, logo);
    return;
  }
  ```
* **Impacto:** La plataforma no cobra la comisión de servicio presupuestada (70%) y omite el registro centralizado de tokens en el contrato Factory.
* **Remediación Requerida:** Desplegar el contrato `anlgram-factory.fc` en Testnet, validar su dirección y actualizar la constante `FACTORY_TESTNET`.

#### [NET-MED-03] Peticiones Directas a TonAPI sin Autenticación Sujetas a Rate-Limit
* **Módulo Afectado:** `assets/js/launchpad.js` L261.
* **Descripción:** `launchpad.js` efectúa llamadas directas a la API pública de TonAPI (`https://tonapi.io/v2/blockchain/accounts/${ANLGRAM_CONFIG.CLONE_SOURCE}`) sin cabecera de autenticación ni uso del proxy de backend.
* **Impacto:** Bajo tráfico moderado, las peticiones son bloqueadas por el servidor con código de error HTTP `429 Too Many Requests`, interrumpiendo el despliegue directo de Jettons.
* **Remediación Requerida:** Centralizar todas las consultas a la blockchain a través de `anlgramFetchTonApi` en `assets/js/api.js`, utilizando el servidor proxy local o inyectando la clave de API autorizada.

---

### 3.4 Hallazgos Bajos e Informativos (Severity: Low & Informational)

#### [UX-LOW-01] Gráfico de Métricas de Crecimiento Hardcodeado
* **Módulo Afectado:** `memecoin-platform.html` L1822-L1845.
* **Descripción:** El gráfico de crecimiento en la vista de analítica utiliza datos hardcodeados: `data: [120, 190, 150, 220, 310, 480, 520]`.
* **Impacto:** Información estática meramente ilustrativa que no refleja la actividad real de la plataforma.
* **Remediación Requerida:** Conectar el canvas de Chart.js a un endpoint de métricas indexadas o mostrar el historial de despliegues reales del usuario.

#### [SEC-INFO-01] Dirección de Tesorería sin Esquema Multisig Documentado
* **Módulo Afectado:** `assets/js/launchpad.js` L26 (`TREASURY: 'UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd'`).
* **Descripción:** La dirección que recibe comisiones corresponde a una wallet individual estándar (v4R2). No se especifica un contrato multisig o timelock para la custodia institucional de las comisiones del protocolo.
* **Impacto:** Riesgo operativo y de gobernanza si la clave privada de dicha wallet resulta comprometida.
* **Remediación Requerida:** Migrar la tesorería a un contrato multisig oficial de TON (p. ej. TON Multisig v2).

---

## 4. PRUEBAS EJECUTADAS Y NO EJECUTADAS (TESTS EXECUTION & VERIFICATION)

> [!IMPORTANT]
> **Separación estricta de niveles de evidencia:** Esta sección diferencia cuatro categorías que no deben mezclarse: (1) **pruebas locales y simulaciones en memoria/TVM** repetidas con registro completo, (2) **suites con consultas externas HTTPS de solo lectura** registradas en ejecuciones previas de la sesión y **no repetidas ahora**, (3) **suites no ejecutadas**, y (4) **validación real en blockchain no realizada** (0 despliegues, 0 firmas y 0 transacciones transmitidas). El conjunto de pruebas **no** debe describirse como totalmente libre de red, dado que 2 de las 20 suites contienen consultas HTTP externas de solo lectura.

### 4.0 Resumen verificado

| Concepto | Valor | Base de la evidencia |
| :--- | :--- | :--- |
| Archivos de prueba identificados en el repositorio (`test*.js`) | **30** | Inventario de archivos del worktree |
| Suites distintas ejecutadas al menos una vez en la sesión | **20** | Registros de ejecución (ver 4.1 y 4.2) |
| Suites locales o de simulación repetidas en la verificación | **18** | Registros completos guardados en disco (ver 4.1 y 4.4) |
| Pruebas aprobadas en esas 18 suites locales/simulación | **961** | Resumen impreso por cada suite + código de salida 0 |
| Pruebas fallidas en esas 18 suites locales/simulación | **0** | Ídem |
| Pruebas omitidas en esas 18 suites locales/simulación | **0 reportadas** | Solo 2 suites informan de omisiones (`test-deploy-launchpad-testnet.js`: `skipped 0`; `test-master-security-audit.js`: `0 SKIPPED`). Las otras 16 no reportan contador de omisiones, por lo que no se puede determinar por salida estándar si existen casos omitidos internamente. |
| Suites con consultas de red en resultados anteriores (no repetidas ahora) | **2** | `test-onchain-security-and-burn.js` (**33** aprobadas / 0 fallidas) y `test-staking-comprehensive.js` (**103** aprobadas / 0 fallidas en su corrida posterior; tuvo una ejecución anterior con **99 aprobadas / 1 fallida**). Ver 4.2 |
| Suma combinada reportada (última ejecución de cada una de las 20 suites) | **1.097** (961 + 33 + 103) | **Advertencia:** Esta cifra mezcla clases de evidencia distintas (961 pruebas locales/simulación reejecutadas + 136 pruebas de suites previas que incluyen 5 consultas HTTPS GET en vivo a `tonapi.io`, una de las cuales falló en una corrida previa). |
| Suites no ejecutadas | **10** | Ver 4.3. El número de pruebas que contienen es **desconocido**. |
| Transacciones reales de validación en blockchain | **0** | No se desplegó ningún contrato ni se firmó o transmitió ninguna transacción. |

**Criterio de conteo (sin duplicados):** Se contabiliza **una única ejecución por suite** en las sumas. La suite `test-staking-comprehensive.js` se ejecutó dos veces anteriormente en la sesión: una primera ejecución con **99 aprobadas y 1 fallida** y una ejecución posterior con **103 aprobadas y 0 fallidas**. Ambas se documentan en 4.2, sin duplicar sus pruebas en el total y dejando constancia de que **la causa del fallo inicial no fue identificada**.

### 4.1 Suites locales y de simulación repetidas (18 suites: 961 aprobadas / 0 fallidas)

Ejecutadas con `node <suite>` (o `node --test` cuando se indica) y con `NODE_PATH=E:/ANLGRAM/minter-contract/node_modules;E:/ANLGRAM/node_modules`, dado que el worktree aislado no contiene un directorio `node_modules` propio. Antes de ejecutarlas se inspeccionó el código de cada suite: ninguna solicita firmas reales, carga frases semilla/claves privadas ni realiza peticiones a servicios externos en internet. `test-distribution-wizard-flow.js` utiliza un `sendTransaction` simulado que devuelve `'fake-boc'`. `test-master-security-audit.js` levanta únicamente un servidor local efímero en `127.0.0.1` para verificar el rechazo de entradas inválidas.

| # | Suite | Categoría | Directorio de ejecución | Aprobadas | Fallidas | Omitidas |
| :-- | :--- | :--- | :--- | --: | --: | :-- |
| 1 | `test-bonding-curve-tvm.js` | Simulación local TVM de contratos | worktree | 97 | 0 | no reporta |
| 2 | `minter-contract/test-bonding-curve-math.js` | Unitaria matemática + fuzzing (12.000 ciclos, semilla fija) | worktree | 46 | 0 | no reporta |
| 3 | `minter-contract/test-deploy-launchpad-testnet.js` (`node --test`) | Unitaria preflight Phase 3A / DAG | worktree | 9 | 0 | 0 |
| 4 | `test-blockchain-provider.js` | Unitaria (proveedor de solo lectura) | worktree | 25 | 0 | no reporta |
| 5 | `test-anl-labs-regression.js` | Frontend (análisis estático / VM) | worktree | 33 | 0 | no reporta |
| 6 | `test-distribution-wizard-flow.js` | Frontend (VM con wallet simulada) | worktree | 21 | 0 | no reporta |
| 7 | `test-step4-vesting-comprehensive.js` | Simulación local TVM + frontend | **E:\ANLGRAM** (*) | 50 | 0 | no reporta |
| 8 | `test-wizard-comprehensive.js` | Frontend | worktree | 50 | 0 | no reporta |
| 9 | `test-wizard-ui-centering.js` | Frontend | worktree | 28 | 0 | no reporta |
| 10 | `test-master-security-audit.js` | Seguridad (motor + servidor local `127.0.0.1`) | **E:\ANLGRAM** (*) | 51 | 0 | 0 |
| 11 | `test-explorer-regression.js` | Frontend / regresión | worktree | 148 | 0 | no reporta |
| 12 | `test-intel-exchange-regression.js` | Frontend / regresión | worktree | 73 | 0 | no reporta |
| 13 | `test-profit-calculator-regression.js` | Frontend / regresión | worktree | 65 | 0 | no reporta |
| 14 | `test-wallet-pnl-accounting.js` | Unitaria | worktree | 22 | 0 | no reporta |
| 15 | `test-stake-vault-comprehensive.js` | Simulación local TVM | worktree | 72 | 0 | no reporta |
| 16 | `test-tma-integration.js` | Frontend | worktree | 64 | 0 | no reporta |
| 17 | `test-search-explorer.js` | Frontend | worktree | 47 | 0 | no reporta |
| 18 | `test-token-drawer-intelligence.js` | Frontend | worktree | 60 | 0 | no reporta |
| | **Total (18 suites locales/simulación)** | | | **961** | **0** | **0 reportadas** |

(*) Las suites 7 y 10 resuelven dependencias mediante rutas relativas fijas a `<directorio>/minter-contract/node_modules/...` y fallaron inicialmente en el worktree con `MODULE_NOT_FOUND`. Se ejecutaron desde `E:\ANLGRAM`, que se encuentra en el **mismo commit** (`c09d2a9ebbf836aefb808800031e6d8e008e8a34`) y cuyos archivos evaluados (`test-master-security-audit.js`, `test-step4-vesting-comprehensive.js`, `server.js`, `assets/js/anl-labs.js`, `assets/js/token-verification-engine.js`, `memecoin-platform.html`) tienen hashes SHA-1 de blob idénticos en ambos árboles.

**Desglose por tipo dentro de las 18 suites locales:**
- **Simulación local TVM de contratos:** suites 1, 7 (sección TVM) y 15. Ejecutan bytecode compilado en `ton-contract-executor` en memoria; **no constituyen validación en blockchain**.
- **Pruebas unitarias y matemáticas:** suites 2, 3, 4 y 14.
- **Pruebas de frontend y regresión (análisis estático y `vm`):** suites 5, 6, 7 (sección frontend), 8, 9, 11, 12, 13, 16, 17 y 18.
- **Pruebas locales de seguridad:** suite 10.
- **Compilación de contratos:** Durante esta auditoría no se ejecutaron los scripts `compile-*.js`; las suites TVM leen los artefactos JSON previamente compilados en `minter-contract/build/`.

### 4.2 Suites con consultas externas de solo lectura en resultados anteriores (2 suites: no repetidas ahora)

Estas dos suites realizan peticiones **HTTPS GET de solo lectura** hacia `tonapi.io` y `testnet.tonapi.io`. Aunque no firman ni transmiten transacciones, dependen de disponibilidad de red externa. **No fueron repetidas durante la verificación de cifras**; los datos siguientes provienen únicamente de las salidas de consola registradas previamente en la sesión:

| Suite | Corridas previas en la sesión | Resultado registrado | Alcance de las consultas externas |
| :--- | :--- | :--- | :--- |
| `test-onchain-security-and-burn.js` | 1 ejecución previa | **33 aprobadas / 0 fallidas** | 32 pruebas son locales (análisis estático y serialización BoC de `op::burn` sin broadcast) y **1 prueba** (sección 8) ejecuta un `GET` en vivo a `https://tonapi.io/v2/blockchain/accounts/.../methods/get_jetton_data` sobre el minter público de Notcoin. |
| `test-staking-comprehensive.js` | **2 ejecuciones previas con distinto resultado** | Corrida 1: **99 aprobadas / 1 fallida** (código de salida 1). Corrida 2: **103 aprobadas / 0 fallidas** (código de salida 0). | 99 aserciones son locales (matemática BigInt, simulación TVM y auditoría estática) y **4 aserciones** (sección 3) consultan por `GET` el estado de los pools oficiales de Tonstakers en Testnet y Mainnet dentro de un bloque `try/catch`. |

**Limitaciones documentadas sobre estas 2 suites:**
1. **Causa del fallo inicial no identificada:** De la primera corrida de `test-staking-comprehensive.js` (99 aprobadas / 1 fallida) solo se capturó el resumen final truncado en consola; **no existe evidencia que permita identificar cuál aserción falló ni su causa exacta**.
2. **Omisión silenciosa en caso de error de red:** En `test-staking-comprehensive.js` (L1158-L1194), las 4 aserciones de lectura en vivo están envueltas en un `try/catch` que solo imprime un `console.warn` si ocurre un error de red, sin incrementar el contador de fallos ni registrar omisiones.
3. **Consultas a contratos de terceros:** Las 5 aserciones de red leen contratos públicos ya existentes de terceros (Notcoin y Tonstakers); **ninguna de ellas valida contratos de ANLGRAM MemeLabs desplegados en blockchain**.

### 4.3 Suites no ejecutadas (10 suites: número de pruebas desconocido)

| Archivo de prueba | Motivo de no ejecución y limitaciones | Número de pruebas |
| :--- | :--- | :--- |
| `test-tonapi-backend-proxy.js` | Requiere un proceso proxy local activo en `localhost:8080`. Sin ese servicio levantado no puede evaluarse válidamente. | Desconocido (no determinado) |
| `minter-contract/test-stake-vault-live-testnet.js` | Suite de integración en vivo contra TON Testnet. Excluida por la regla de no ejecutar operaciones on-chain en vivo. | Desconocido (no determinado) |
| `minter-contract/test-imgbb.js`, `minter-contract/test-imgur.js`, `minter-contract/test-imgur-keys.js`, `minter-contract/test-pixeldrain.js`, `minter-contract/test-upload.js` | Scripts de carga de archivos hacia APIs externas de alojamiento de imágenes. Excluidos por realizar escrituras HTTP externas. | Desconocido (no determinado) |
| `test-worker-deep-audit.js` | No inspeccionada ni ejecutada durante esta auditoría. | Desconocido (no determinado) |
| `test.js`, `test2.js` | Scripts en raíz no inspeccionados ni ejecutados durante esta auditoría. | Desconocido (no determinado) |

### 4.4 Evidencia utilizada

- Registros completos de las 18 suites locales repetidas (`*.log` y `summary.json`) almacenados en `C:\Users\maino\.gemini\antigravity\brain\8fc5ae8a-5a6d-499f-894a-3f6398120102\scratch\test-logs\`, junto con los registros del fallo inicial de resolución de módulos en el worktree (`*.worktree-fail.log`).
- Scripts de inspección estática y ejecución controlada en `scratch\verify_scan_network.js`, `scratch\verify_fetch_lines.js` y `scratch\verify_rerun.js`.
- Salidas de consola de la sesión para las 2 suites con consultas externas no repetidas (`test-onchain-security-and-burn.js` y las dos corridas de `test-staking-comprehensive.js`).

### 4.5 Ausencia de validación real en blockchain

**Se registraron exactamente 0 transacciones reales de validación en blockchain.** Durante esta auditoría no se desplegó ningún contrato en Testnet ni Mainnet, no se conectó ni firmó con ninguna wallet real y no se transmitió ningún mensaje BoC a la red TON. Ni las 961 pruebas locales/simulaciones ni las consultas GET de lectura a contratos de terceros constituyen evidencia de funcionamiento on-chain de MemeLabs.

---

## 5. FUNCIONES QUE PUEDEN CONSERVARSE TAL COMO ESTÁN

A partir de la inspección de código y las pruebas locales/simulaciones TVM, los siguientes componentes presentan una estructura técnica coherente y **pueden conservarse en su diseño actual de código**, sujetos a su posterior verificación en vivo en Testnet antes de cualquier paso a producción:

1. **Despliegue Directo de Jettons TEP-74 (`deployJettonWeb3`):**
   * El empaquetado de metadatos TEP-64 en celdas BoC, la estructura del `StateInit` y el cálculo determinista de la dirección del minter siguen la especificación TEP-74/TEP-64 en código; requiere validación de extremo a extremo con wallet real en Testnet.
2. **Renuncia de Administración (`renounceAdminWeb3` y `labsConfirmRenounceExecution`):**
   * La construcción del mensaje `op::change_admin (0x03)` apuntando a `addr_none` (null) y la lógica de sondeo de `get_jetton_data` antes de actualizar el estado en la UI están correctamente implementadas en código; pendiente de verificación on-chain en Testnet.
3. **Mecanismo de Salvaguarda de Vesting en Mainnet (`labsSubmitVesting` L1388-L1397):**
   * El bloqueo explícito que impide el despliegue de contratos de vesting en Mainnet mientras no se complete la auditoría formal protege adecuadamente al usuario.
4. **Módulo de Distribución Masiva (`labsExecuteDistributionBatch`):**
   * La partición en lotes de 4 destinatarios (límite estándar de mensajes por transacción en TON Connect), la protección contra envíos concurrentes y el soporte para reanudar lotes están bien estructurados a nivel de código.
5. **Módulos Defensivos y de Sanitización (`assets/js/security.js` y `token-verification-engine.js`):**
   * Funciones como `isValidTonAddress`, `escapeHtml` y `sanitizeUrl` superan las baterías de pruebas unitarias locales.
6. **Contratos Inteligentes del Motor Launchpad (`minter-contract/contracts/`):**
   * La resolución de dependencias circulares mediante el método DAG unidireccional (`op::init_lp_locker` `0x414e4c39`), la segregación de fondos y la estructura TL-B de STON.fi v2.1 superan las 97 pruebas en el simulador local TVM, quedando pendientes de despliegue y prueba real en TON Testnet.

---

## 6. CAMBIOS RECOMENDADOS PARA CONECTAR FUNCIONES PENDIENTES A OPERACIONES REALES

Para que MemeLabs tenga sus funciones críticas conectadas a operaciones reales, se deben implementar las siguientes integraciones técnicas:

### 6.1 Implementación del Widget de Trading de Curva de Vinculación (Buy / Sell)
1. **Interfaz Gráfica:**
   * Agregar a `memecoin-platform.html` una sección de intercambio interactiva dentro del Launchpad que permita seleccionar comprar con TON o vender Jettons.
   * Mostrar el precio spot actual y la barra de progreso hacia la graduación (0 a 500 TON).
2. **Lógica de Conexión Web3:**
   * Para compras: Construir el mensaje TON Connect hacia la dirección de la curva (`curve_address`), adjuntando el valor en TON a ingresar con el opcode `0x414e4c02` (`op::buy_tokens`), adjuntando en el payload el `min_tokens_out` para protección de deslizamiento.
   * Para ventas: Construir un mensaje TEP-74 `op::transfer` (`0x0f8a7ea5`) dirigido a la Jetton Wallet del usuario, con `destination = curve_address` y un forward payload que contenga `0x414e4c03` (`op::sell_tokens`) y `min_ton_out`.

### 6.2 Eliminación de Datos Mock en la Gestión de Liquidez
1. **Reemplazo del Bloque Ficticio en `memecoin-platform.html`:**
   * Eliminar las líneas 2406-2440 que inyectan el pool `TON-NewToken EQCa...XyZ1`.
   * Implementar una llamada asíncrona a la API de STON.fi v2 (`https://api.ston.fi/v1/pools`) filtrada por los Jettons en posesión de la wallet conectada. Si no hay registros, mostrar un mensaje claro de saldo cero.

### 6.3 Conexión de la Migración y Bloqueo de LP Tokens
1. **Automatización de Graduación:**
   * En lugar de abrir un enlace externo hacia STON.fi, conectar la interfaz al endpoint `op::initiate_migration` del contrato `anlgram-bonding-curve.fc`.
   * Tras la graduación, mostrar en tiempo real la confirmación emitida por `anlgram-lp-locker.fc` (`op::lp_locked_confirmation` `0x414e4c38`), mostrando el enlace directo al explorador donde se evidencia la custodia irrevocable de los LP tokens.

### 6.4 Decodificación de Rebotes y Errores de TVM
1. **Manejo de Errores de Transacción:**
   * Actualizar los bucles de sondeo para consultar el trace de la transacción en TonAPI (`/blockchain/transactions/{hash}`).
   * Si la transacción saliente generó un mensaje rebotado (`bounced == true`), extraer el código de error devuelto por la TVM (p. ej., exit code 401 de autorización o 405 de deslizamiento) y presentarlo claramente al usuario en lugar de esperar a que venza el tiempo límite.

### 6.5 Endurecimiento de Políticas Web y SRI
1. **Ajuste de Cabeceras CSP:**
   * Descargar las librerías `@tonconnect/ui` y `chart.js` a la carpeta local `assets/vendor/` o agregar los hashes SHA-384 correspondientes.
   * Remover `'unsafe-eval'` de la etiqueta `<meta http-equiv="Content-Security-Policy">`.

---

## 7. DEPENDENCIAS QUE DEBEN QUEDAR RESUELTAS ANTES DE INTEGRAR LOS CONTRATOS NUEVOS

Antes de desplegar los contratos inteligentes e integrarlos con la interfaz web, es indispensable resolver las siguientes dependencias operativas y de infraestructura:

1. **Despliegue y Fijación de Parámetros en TON Testnet:**
   * Desplegar secuencialmente en Testnet respetando el grafo acíclico (DAG):
     1. `anlgram-launchpad-jetton-minter.fc` (Minter Maestro)
     2. `anlgram-lp-locker.fc` (Bloqueador de LP)
     3. `anlgram-migration-router.fc` (Router de Migración STON.fi v2.1)
     4. `anlgram-bonding-curve.fc` (Curva AMM)
   * Ejecutar la inicialización autorizada de un solo uso en el LP Locker: `op::init_lp_locker` (`0x414e4c39`).
2. **Validación de Endpoints DEX en Testnet:**
   * Confirmar la dirección del Router STON.fi v2.1 en Testnet y del contrato pTON oficial, asegurando que sus opcodes coincidan con la especificación TL-B (`provide_lp` `0x37c096df` y `ton_transfer` `0x01f3835d`).
3. **Proxy de Backend para TonAPI:**
   * Configurar e iniciar un proxy local o Cloudflare Worker que inyecte de manera segura la clave de API de TonAPI (`Authorization: Bearer <KEY>`) para evitar bloqueos por tasa de peticiones (429) en los navegadores de los clientes.
4. **Auditoría Externa de Seguridad de Contratos:**
   * Someter los contratos `anlgram-bonding-curve.fc` y `anlgram-vesting-wallet.fc` a una revisión formal de seguridad externa antes de autorizar cualquier transacción de bloqueo con capital real en Mainnet.

---

## 8. CRITERIOS VERIFICABLES PARA TESTNET Y MAINNET (VERIFIABLE CRITERIA & GATEWAYS)

Para declarar el producto formalmente listo para cada entorno, se deben cumplir y verificar de forma independiente los siguientes hitos:

### 8.1 Criterios de Aprobación para Piloto en TON Testnet
- [ ] **DAG Desplegado y Vinculado:** Los 4 contratos del motor desplegados en Testnet con el LP Locker inicializado vía `op::init_lp_locker` y con enlace directo confirmado a la curva de vinculación.
- [ ] **Trading Interactivo Operativo:** El usuario puede ejecutar compras (`op::buy_tokens`) y ventas (`op::sell_tokens`) desde `memecoin-platform.html` firmando mediante Tonkeeper o MyTonWallet en Testnet.
- [ ] **Graduación Automática Comprobada en Cadena:** Una compra en Testnet que alcance el umbral de 500 TON activa la migración automática, deposita la liquidez en el router de STON.fi y transfiere los LP tokens al Locker, verificable en Tonscan Testnet.
- [ ] **Cero Datos Mock:** Eliminación comprobada al 100% de la pool simulada `EQCa...XyZ1` y de los saldos artificiales de `145.20 TON`.
- [ ] **Decodificación de Rebotes:** En caso de transacción fallida por deslizamiento, la interfaz reporta explícitamente "Transacción rebotada: Deslizamiento de precio excedido".

### 8.2 Criterios de Aprobación para Lanzamiento en TON Mainnet
- [ ] **Informe de Auditoría de Smart Contracts Sin Hallazgos Críticos:** Auditoría criptográfica y de TVM concluida y firmada por firma independiente.
- [ ] **Tesorería Multi-Firma:** La dirección de recepción de comisiones del protocolo (`TREASURY`) debe ser un contrato multi-firma institucional desplegado y comprobado en Mainnet.
- [ ] **CSP Blindada con SRI:** Eliminación total de `'unsafe-eval'` en el CSP y presencia de hashes de integridad SHA-384 en todas las etiquetas de scripts de terceros.
- [ ] **Infraestructura de Indexación y Proxy Dedicada:** Nodos de RPC y balanceadores de TonAPI dedicados para soportar alta concurrencia sin riesgo de degradación por rate-limit.
- [ ] **Habilitación Controlada de Vesting:** Retiro de la advertencia informativa preventiva únicamente tras comprobar el funcionamiento inmutable del contrato de bloqueo en Testnet con múltiples ciclos de desbloqueo temporal completados.

---

**Fin del Informe de Auditoría Independiente**  
*Aprobado para publicación técnica en `docs/launchpad/memelabs-production-readiness-audit.md`.*
