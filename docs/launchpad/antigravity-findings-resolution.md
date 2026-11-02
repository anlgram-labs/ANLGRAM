# Resolución focalizada del cross-review de Antigravity

Revisión recibida: **IA independiente, no auditoría humana cualificada**, sobre `383785353de47a66b092f80ed979a3009c98c6a2`. Comparación realizada contra el head real de PR #12, `36f2cb7d7d0e21fb651a644c3487a342dbdf8102`, con worktree inicialmente limpio y refs remotas actualizadas. No se repitió la auditoría general ni se regeneró el verificador de recibos.

| Hallazgo original | Estado comprobado en 36f2cb7 | Corrección focalizada y líneas actuales | Evidencia dirigida |
|---|---|---|---|
| 1. Saturación del journal a 256 bloques | Reproducible: `recovery/evidence.mjs:56` incluía el bloque en el ID y `:60` limitaba el índice a256. | `recovery/evidence.mjs:57` deduplica por estado/hash de última transacción y nivel de prueba. `:61` adopta registros V1 sin borrarlos; `:66` aplica el presupuesto a nuevos estados distintos, no a bloques repetidos. `recovery/ledger.mjs:99` también evita duplicar conciliaciones por cada bloque. | Tests F1:300 bloques→1 registro; migración de256 registros V1 sin eliminación y aceptación de un estado nuevo. Se conservan timestamps históricos, sin presentarlos como frescos. |
| 2. RPC seriales / ventana de15s | Parcialmente correcto. Había una cola global para ambos proveedores y observación serial. El supuesto límite global de15s para las9 llamadas y la interpretación de `delay>2000` como cola desbordada son incorrectos: son controles de adquisición/fases y cooldown del proveedor. | `testnet-rpc.mjs:24` y `:36`: dos colas por proveedor, preservando serialización, dedup y gates persistentes dentro de cada una. `recovery/runtime.mjs:25`: lecturas independientes concurrentes; `:34` conserva15s por fase. Se mantienen ambas observaciones completas y la revalidación posterior a fees. `testnet-rpc.mjs:40` respeta además4200ms entre consultas anónimas de TonAPI; antes2000ms incumplían su cuota documentada. | F2: primary detenido no bloquea secondary; requests del mismo proveedor se deduplican; fase de15001ms se rechaza. Nueva prueba de cuota anónima y regresiones de429/reinicio. No se garantiza disponibilidad ni latencia inferior a10s. |
| 3. Inconsistencia de revisión de quotes | Inconsistencia real de esquema/mantenibilidad; **no bypass demostrado**. `ledger.mjs:36` ya comprobaba la revisión antes de reservar. El cambio aislado sugerido en el informe sería una modificación del código, no una reproducción de una explotación existente. | `recovery/ledger.mjs:23` almacena `quote` estructurado; `:34` añade `quoteRevision` y `quoteScopeKey`; `:45` verifica revisión/scope/deadline y copia el registro al scope de `FinancialOperation` antes de preparar/reclamar. Los guards compartidos ahora se ejecutan. El alias histórico `revision`/contador escalar se conserva, no concede autoridad. Drafts antiguos sin el esquema canónico no se reservan. | F3: registro canónico y copia en el scope; scope manipulado se rechaza sin reserva. Regresiones concurrentes, de supersesión y SQLite siguen pasando. |
| 4. Wall-clock frente a expiración de cadena | Parcial/informativo. Persistía un gate local de preparación; no desbloqueaba una operación ni probaba el deadline de la firma nativa desconocida. 36f2cb7 ya verificaba tiempo e inclusión de bloques en el pipeline de recibos, pero no exigía ese dato para preparar una quote. | `recovery/policy.mjs:34` verifica tiempo de bloque posterior al deadline conocido y última transacción coincidente. `recovery/runtime.mjs:69` exige la prueba criptográfica de cuenta/bloque antes de cualquier preparación pública y estimación. Se reutiliza `acquireProvenAccount` (`receipts.mjs:32`), extraído del pipeline existente. No hay pruebas de consenso/quórum ni afirmación sobre bytes nativos desconocidos. | F4: reloj local adelantado no sustituye la expiración de cadena; falta de prueba impide llegar a estimar fees. El lock y la firma deshabilitada no cambian. |
| 5. Agotamiento de90 deadlines | Reproducible como agotamiento temporal, no pérdida de fondos ni desbloqueo. | `recovery/runtime.mjs:101`: admisión persistente de preparación cada3000ms, antes de RPC. `recovery/ledger.mjs:26`: error tipado429 `QUOTE_DEADLINES_EXHAUSTED`. `curve-operation.mjs:25`: motivo local separado de429 del proveedor, con Retry-After; `runtime.mjs:106` respeta ambos cooldowns. No se amplían90s de mensaje ni60s de quote. | F5:90 slots ocupados devuelven429 conservando draft/revisión/lock; throttle persiste en almacenamiento y rechaza antes de consultar RPC. No se reintenta una firma. |

Las líneas son de los archivos de esta entrega en `testnet-interface/`; los hashes exactos están en `recovery-review-source-manifest.json`. El informe y el paquete de revisión no son una aprobación de activación.

## Pipeline y publicación que el informe antiguo no cubría

`36f2cb7` ya implementó `account-proof.mjs`, adquisición de historial de dos proveedores, `buildAndVerifyReceipt`, conciliación persistente y `/api/recovery/receipts`. Sus omisiones descritas en el cross-review no se trataron como trabajo nuevo. Se reutiliza el verificador de recibos existente; el único refactor de adquisición separa la obtención de cuenta probada de la obtención de historial para poder usarla también antes de una quote.

Verificación independiente al empezar esta entrega: Pages publicó `36f2cb7` en https://8e6eea6f.anlgram-testnet-preparation.pages.dev; Worker activo `3726852d-96b8-4964-bf59-5b99bf5d07d0`; el dominio canónico respondió200 con execution hash `ad9a5c62ac03f6a1bfb36236fc3ff7bed53fb1333b829033e2493b0f1a2fadbf`. El lock original estaba intacto y `/api/recovery/receipts` devolvió403 sin proof. Esto confirma la publicación anterior, no la de estas correcciones.

El propietario probó conexión/ton_proof y el botón público; reportó429 de TONAPI_TESTNET. No se cuenta como adquisición autenticada completada ni como recibo finalizado. La inspección de nombres de secretos de Pages confirmó que falta `TONAPI_TESTNET_API_KEY`; TON Center sí tiene su binding independiente. La clave entregada después resultó ser de TON Center: TonAPI devolvió401, no se persistió ni se incorporó al repositorio. No se alteró la credencial de TON Center existente. Nunca registrar el valor de ninguna clave.

Cuota pública y autenticación: https://docs.tonconsole.com/tonapi/ documenta una petición anónima por4s. La clave opcional de TonAPI debe introducirse exclusivamente por terminal en el proyecto Pages Testnet, no en el Worker del mismo nombre ni en el chat:

```text
cd C:\Users\maino\.codex\worktrees\memelabs-sprint\ANLGRAM\testnet-interface\pages
npx.cmd wrangler pages secret put TONAPI_TESTNET_API_KEY --project-name anlgram-testnet-preparation
```

Una publicación posterior de Pages aplica el nuevo binding. No se ha emitido ni contratado una credencial de TonAPI, ni se sustituye por la clave Mainnet de otro servicio. El acceso anónimo corregido aún puede recibir429 por cuota compartida del proveedor; siempre falla cerrado sin servir saldos antiguos.

## Pruebas reales ejecutadas

- 69 casos dirigidos de fuente/modelo/política/proveedor/recibos:69 pass,0 fail.
- 5 casos reales workerd/SQLite, incluidos persistencia del ledger/journal y cooldowns tras reinicio:5 pass,0 fail.
- 42 casos sobre el bundle compilado y puentes HTTP locales controlados:42 pass,0 fail en la ejecución final. En la primera ejecución hubo41 pass/1 fail: el control negativo del SDK sin parche abortaba a100ms bajo carga de compilación y no siempre llegaba al segundo POST. Se corrigió el harness para esperar el segundo POST recibido dentro de su espera acotada existente antes de abortar; no se redujo la aserción ni se cambió el SDK o las expiraciones de la aplicación. El control volvió a medir2 POSTs con el mismo RPC ID; recuperación deshabilitada midió0 POSTs.

Total final seleccionado: **118 pass,0 fail**; doce casos nuevos (nueve de hallazgos, uno de cuota anónima y dos de integridad de build). Build de Pages y dry-run del Worker pasaron. No se repitieron el wizard, el minter ni la suite completa de contratos. No son pruebas de nueva ejecución on-chain.

### Desajuste adicional confirmado al verificar la publicación

Se confirmó `1e7f4fe` en el API público, pero el SDK servido no coincidía con el hash del bundle local probado. La primera diferencia estaba en el hash de `sdk-patch.mjs`: `31485e…` es el digest LF del blob Git; `76ae83…` es el de exactamente el mismo texto en CRLF, y aparecía en el bundle servido. Por tanto, un build desde otro checkout podía generar una identidad distinta y publicar un cliente incompatible con el identificador del servidor, sin cambiar la lógica del SDK.

Corrección mínima en `build-source-integrity.mjs:5` y `build.mjs`: normalizar solo CRLF→LF al construir el índice de hashes de fuente. Se mantienen byte-exactos el pin del SDK original, las verificaciones de BOC y el hash del bundle compilado. Dos regresiones comprueban el índice completo con ambas representaciones y que un cambio real de código siga cambiando la identidad, además del binding del bundle y pin originales. El transporte y el verificador de recibos no se reimplementaron.

La comprobación pública fallida se conserva en `antigravity-fixes-public-check-2026-11-02.json` (bundle distinto y429 del proveedor); no se presenta como éxito. La verificación final de la publicación se registra por separado. No se fuerza la activación financiera por un desajuste de versiones.

## Bloqueos que siguen requiriendo revisión externa

1. No existe informe humano cualificado sobre el commit corregido. El cross-review de IA es evidencia interna adicional, no sustituto.
2. Inclusión criptográfica relativa a un root corroborado por dos proveedores no equivale a verificar el conjunto de validadores y sus firmas/quórum. La aceptación de ese modelo para recuperación supervisada sigue pendiente.
3. No hay BOC firmado auténtico ni recibo del intento original; tampoco se ha ejecutado invalidación de nonce. No se puede fabricar un recibo de una operación que aún no ocurrió.
4. TON Connect no impone atómicamente el seqno elegido por la aplicación; ausencia de actividad concurrente y firma nativa exacta siguen siendo condiciones a revisar antes de cualquier autorización futura.
5. La retención conserva todos los registros V1 y hasta256 nuevos estados V2 distintos. No hay poda automática; el presupuesto de estados realmente distintos sigue siendo una defensa operativa explícita.

`LOCKED_PENDING_RECONCILIATION`, su fingerprint, el bloqueo de recuperación/sucesor y Mainnet permanecen intactos. No se habilitó firma, no hubo transacciones, gasto TON, despliegue de contratos, merges o cambios de producción.
