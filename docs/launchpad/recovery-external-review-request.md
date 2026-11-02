# Revisión externa focalizada: recuperación de Curve #2

Estado: **pendiente de contratación/asignación y de informe externo**. Este documento y las pruebas internas no constituyen una auditoría independiente. El propietario confirmó que todavía no tiene un auditor. No se ha contactado ni contratado a terceros.

## Solicitud para compartir con un especialista en TON

Solicitamos revisar el backend de recuperación Testnet V5R1 y su conciliación antes de habilitar un intento separado de invalidación de nonce. PR de desarrollo: https://github.com/anlgram-labs/ANLGRAM/pull/12. El commit exacto y los hashes del código de esta entrega figuran en el informe y en `recovery-review-source-manifest.json`. La revisión debe identificar el commit completo, metodología, identidad del revisor, hallazgos, correcciones y limitaciones; no basta una aprobación genérica del repositorio.

El intento original `ANLTEST_CURVE_TX2`, fingerprint `508c80f62122112cbda6af7a1fdad53a4a1bc86bad009bdd66f212988055bb28`, permanece `LOCKED_PENDING_RECONCILIATION`. No tenemos su BOC firmado ni recibo. No debe borrarse, rearmarse, sustituirse o considerarse ejecutado a partir de un saldo/nonce. El minter ya desplegado no se debe desplegar otra vez.

Alcance mínimo:

1. Ledger aislado, persistencia/atomicidad/reinicio, ancestro inmutable, reservas y ausencia de rutas de firma o reintento de recuperación habilitadas.
2. V5R1 Testnet -3, wallet ID 2147483645, firma/expiración/seqno, fingerprint exacto, modo de envío 3, un único autoenvío propuesto de 0,01 TON sin StateInit y con el payload fijado. Este importe sigue siendo una propuesta, no una autorización de gasto.
3. Pruebas Merkle: bloque maestro → compromiso de shard → bloque de shard → ShardAccounts → Account, más hashes/LT del historial y las celdas completas anterior/posterior vinculadas al state-update de cada transacción.
4. Adquisición exclusivamente en servidor, dos proveedores Testnet fijos, claves separadas, frescura, cuotas, límites de tamaño e historial de 16 entradas. Si falta evidencia o existen operaciones adicionales, detener; nunca inferir éxito o ausencia global de una página de historial.
5. Recibo exacto de dos transacciones: firma del operador, mensaje externo, único autoenvío y entrega a la misma cuenta, acción/compute exitosos, expiración, balance/fees, no cambios de código, avance de nonce y protección de duplicados. Los recibos de proveedor se guardan separados; no completan la operación original ni autorizan un sucesor.
6. ton_proof con dominio, desafío persistente de un solo uso, expiración y rechazo de cuenta/red incorrectas. Revisar los endpoints vacíos protegidos y que el navegador no pueda aportar pruebas, transacciones o autorizaciones editables.

### Decisión de confianza que debe quedar explícita

La nueva prueba valida inclusión criptográfica **relativa a un hash de bloque maestro corroborado por TON Center y TonAPI**. No sincroniza conjuntos de validadores ni verifica sus firmas/quórum desde un checkpoint confiable. `validatorFinalityVerified`, `independentFinalityVerified`, `operationCompleted` y `financialSigningEnabled` permanecen falsos. La revisión debe decidir expresamente si ese modelo de proveedores es suficiente para esta recuperación supervisada en Testnet, o exigir verificación adicional. No aprobar Mainnet por analogía.

Guía oficial sobre esta distinción: https://docs.ton.org/foundations/proofs/verifying-liteserver-proofs.

## Reproducción

Desde `testnet-interface`, usando las dependencias bloqueadas ya instaladas:

```text
node --test test/recovery-receipts.test.mjs test/recovery-evidence.test.mjs test/recovery-runtime.test.mjs test/recovery-preparation.test.mjs test/provider-isolation.test.mjs
node --test test/recovery-receipts-persistence.mjs test/recovery-evidence-persistence.mjs test/recovery-worker-runtime.mjs test/recovery-persistence.mjs
npm run build:pages
node --test test/compiled-transport.test.mjs
```

Las fixtures `v5-account-proof-live-2026-11-02.json` y `v5-source-history-live-2026-11-02.json` contienen lecturas públicas reales de Testnet, no una recuperación ejecutada. Las pruebas Sandbox usan claves locales deterministas únicamente de prueba. Los puentes de los tests del SDK son locales. Nada de ello acredita una transacción real nueva.

La identidad de fuente del build normaliza únicamente CRLF a LF para que el mismo commit tenga el mismo identificador entre checkouts. Los BOCs binarios, el pin del SDK original y el hash del bundle final siguen verificándose sobre bytes exactos. La prueba `test/build-source-integrity.test.mjs` cubre ambos formatos y el rechazo de cambios de código. El bundle público debe coincidir exactamente con `client-build.json`.

## Resultado exigido antes de activar un intento

Informe externo vinculado al commit, sin hallazgos críticos/altos abiertos dentro del alcance, respuesta explícita al modelo de confianza, revisión de cualquier corrección posterior y aprobación exacta del propietario para una nueva operación. No existe una variable de entorno o JSON del cliente que pueda sustituir el informe. Aun con informe favorable, se requieren prueba de propiedad vigente, datos/fees nuevos, confirmación de ausencia de operaciones concurrentes, reserva única y confirmación manual en Tonkeeper. No se autoriza Curve #2 ni operaciones posteriores automáticamente.

## Opciones para solicitar presupuesto (sin contratación automática)

- Hacken publica un servicio específico para TON: https://hacken.io/services/blockchain-security/ton-smart-contract-audit/.
- CertiK publica su trabajo en el ecosistema TON: https://www.certik.com/ecosystems/ton.

Estos enlaces no constituyen una garantía, selección, presupuesto o disponibilidad confirmada. Compartir únicamente el repositorio público y este alcance; nunca claves, seed, credenciales Cloudflare o API keys.
