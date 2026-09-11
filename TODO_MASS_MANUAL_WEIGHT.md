# Plan: Entrada manual de peso para productos MASS en pos-desktop

> **Contexto:** productos MASS (`is_scale_enabled=true`, `base_unit.unit_type='MASS'`).
> - Si la **misma máquina** tiene báscula registrada en HardwareScreen → leer peso de la báscula delegada (endpoint `/scale/current`).
> - Si **no hay báscula** → input numérico manual.
> - Usuario puede **override** del peso leído (editar el valor).
> - Stock en BD ya está en **kg** (base_unit). Precisión: **gramos** (3 decimales, `unit.decimal_places=3`).
> - `CartItem` ya tiene `weightKg` para MASS/CAJ.
> - **1 tarea = 1 commit** (solo archivos propios).

---

## Tarea 1 — Helper de detección MASS y formateo (`src/lib/scale.ts`)

**Qué hacer:**
- Crear `src/lib/scale.ts` con:
  - `isMassProduct(product: Product): boolean` → `product.is_scale_enabled && product.base_unit?.unit_type === 'MASS'`
  - `getScaleDeviceId(): string | null` → lee del auth store (`device_capabilities` o `deviceRegistrations`) el `device_id` de **esta máquina** con `can_scale=true`. Si no hay, `null`.
  - `formatWeightKg(kg: number, decimals = 3): string` → `kg.toFixed(decimals)` (p.ej. "0.250", "1.500").
  - `parseWeightKg(str: string): number` → `parseFloat(str)` con validación > 0.
  - `clampWeight(kg: number, maxKg: number): number` → `Math.min(Math.max(0, kg), maxKg)`.

**Archivos:** `src/lib/scale.ts` (nuevo)

**Validar:**
- [ ] `npx tsc --noEmit`
- [ ] Test rápido en consola del navegador: `import {isMassProduct} from '@/lib/scale'; isMassProduct(productConBascula)` → `true`

**Commit:** `feat(desktop): helper scale.ts detección MASS y formateo peso`

---

## Tarea 2 — Extender ProductSheet para modo MASS

**Qué hacer:** modificar `src/components/ProductSheet.tsx`
- Importar helpers de `scale.ts` y `getScaleReading` de endpoints.
- Props: añadir `scaleDeviceId?: string` (pasado desde PosTerminalScreen).
- Estado nuevo:
  - `weightKg: number` (peso en kg, 3 decimales)
  - `isReadingScale: boolean`
  - `scaleError: string | null`
- En `useEffect` de apertura (`product` cambia):
  - Detectar `isMass = isMassProduct(product)`.
  - Si `isMass`:
    - `weightKg = 0.001` (mínimo 1g) o último peso leído si hay caché.
    - Si `scaleDeviceId` → mostrar UI "Peso báscula" + botón "Leer".
    - Si NO `scaleDeviceId` → **input numérico manual** (`<input type="number" step="0.001" min="0.001" max={product.stock}>`).
  - Si NO `isMass` → comportamiento actual (quantity entero).
- UI peso:
  - **Con báscula:** display "Peso: X.XXX kg" + botón "Leer báscula" (llama `getScaleReading(scaleDeviceId)` → setea `weightKg`, permite override editando el input).
  - **Manual:** input `weightKg` directo.
- Sustituir selector cantidad (+/-) por:
  - MASS: input `weightKg` (stock máximo = `product.stock` en kg).
  - COUNT: selector +/- actual.

**En handleConfirm (MASS):**
```ts
const qty = weightKg; // cantidad = peso en kg
addItem({
  ...,
  quantity: qty,
  weightKg: qty,
  baseQuantity: qty * product.unit_conversion,
  isCaj: false,
});
```

**Archivos:** `src/components/ProductSheet.tsx`

**Validar:**
- [ ] `npx tsc --noEmit`
- [ ] `npm run tauri dev` → abrir producto MASS (ej. "Manzanas" en Frutas y Verduras):
  - Sin báscula registrada → input manual acepta 0.250, 0.500, 1.500.
  - Subtotal = precio/kg × weightKg.
  - Agregar al carrito → aparece en CartSheet con peso.

**Commit:** `feat(desktop): ProductSheet modo MASS (input manual + override báscula)`

---

## Tarea 3 — Detectar báscula disponible en PosTerminalScreen

**Qué hacer:** modificar `src/screens/PosTerminalScreen.tsx`
- Importar `getScaleDeviceId` de `scale.ts`.
- En `loadCatalog` o `useEffect` tras login: `const scaleDeviceId = getScaleDeviceId();`
- Pasar `scaleDeviceId` a `<ProductSheet scaleDeviceId={scaleDeviceId} />`.
- Si el usuario registró báscula en HardwareScreen → `device_capabilities` del auth store tendrá `can_scale=true` para su `device_id`.

**Archivos:** `src/screens/PosTerminalScreen.tsx`

**Validar:**
- [ ] `npx tsc --noEmit`
- [ ] Con báscula registrada en HardwareScreen → ProductSheet muestra "Leer báscula".
- [ ] Sin báscula → input manual directo.

**Commit:** `feat(desktop): PosTerminalScreen detecta báscula local y la pasa a ProductSheet`

---

## Tarea 4 — Lectura de peso desde báscula delegada

**Qué hacer:** en `ProductSheet.tsx` (botón "Leer báscula")
- `handleReadScale = async () => { setIsReadingScale(true); setScaleError(null); try { const reading = await getScaleReading(scaleDeviceId!); setWeightKg(reading.weight_kg); } catch (e) { setScaleError('Báscula no responde'); toast.error('Báscula no responde, use entrada manual'); } finally { setIsReadingScale(false); } }`
- UI: botón deshabilitado mientras `isReadingScale`, muestra spinner. Si error → toast + input manual habilitado.
- El input `weightKg` **siempre editable** (override permitido).

**Archivos:** `src/components/ProductSheet.tsx`

**Validar:**
- [ ] `npx tsc --noEmit`
- [ ] Con báscula real conectada en HardwareScreen: clic "Leer báscula" → peso aparece en input, editable.
- [ ] Sin báscula / error → toast + input manual.

**Commit:** `feat(desktop): lectura peso báscula delegada con override manual`

---

## Tarea 5 — Mostrar peso en CartSheet (carrito)

**Qué hacer:** modificar `src/components/CartSheet.tsx`
- En cada item, si `item.weightKg` existe (MASS/CAJ):
  - Mostrar línea: `Peso: X.XXX kg` debajo del nombre.
  - Subtotal = `unitPrice × weightKg`.
- Para MASS: `quantity` === `weightKg` (mostrar solo peso, no "cantidad").
- Para CAJ: mostrar "1 caja × X.XXX kg".

**Archivos:** `src/components/CartSheet.tsx`

**Validar:**
- [ ] `npx tsc --noEmit`
- [ ] Agregar 2 productos MASS con pesos distintos → carrito muestra pesos correctos y subtotales.

**Commit:** `feat(desktop): CartSheet muestra peso en items MASS`

---

## Tarea 6 — Validaciones de stock y precisión

**Qué hacer:** en `ProductSheet.tsx`
- `max = product.stock` (ya en kg).
- `step = 0.001` (gramos), `min = 0.001`.
- Validar en `handleConfirm`: `weightKg > 0 && weightKg <= product.stock`.
- Toast si `weightKg > stock`: "Stock insuficiente: disponible X.XXX kg".
- Respetar `allow_fractional_sale` y `unit.decimal_places` (MASS siempre 3).

**Archivos:** `src/components/ProductSheet.tsx`

**Validar:**
- [ ] `npx tsc --noEmit`
- [ ] Intentar vender 20kg cuando stock=12.500 → toast error, no agrega.
- [ ] Vender 12.500kg exacto → ok.

**Commit:** `feat(desktop): validaciones stock y precisión gramos en MASS`

---

## Tarea 7 — Modo CAJ (caja por peso) — opcional si hay productos CAJ

**Qué hacer:** en `ProductSheet.tsx`
- Detectar CAJ: `product.is_scale_enabled && product.base_unit?.unit_type === 'COUNT' && product.sale_unit?.unit_type === 'MASS'`.
- UI: cantidad fija = 1 (caja) + peso editable (input o báscula).
- `handleConfirm`:
  ```ts
  addItem({
    ...,
    quantity: 1,
    weightKg: peso,
    baseQuantity: peso * product.unit_conversion,
    isCaj: true,
  });
  ```

**Archivos:** `src/components/ProductSheet.tsx`

**Validar:**
- [ ] `npx tsc --noEmit`
- [ ] Si existe producto CAJ en catálogo → probar venta 1 caja × peso.

**Commit:** `feat(desktop): modo CAJ (caja por peso) en ProductSheet`

---

## Tarea 8 — Port a pos-mobile (paralelo, después de desktop)

**Qué hacer:** en `pos-mobile/src/components/ProductSheet.tsx`
- Mismo patrón: `isMassProduct`, input manual (`TextInput` keyboardType="decimal-pad"), botón leer báscula (`Alert` + `getScaleReading`).
- `CartSheet` mobile muestra peso.

**Archivos:** `pos-mobile/src/components/ProductSheet.tsx`, `pos-mobile/src/components/CartSheet.tsx`

**Validar:**
- [ ] `npx tsc --noEmit` en pos-mobile
- [ ] `npm test` en pos-mobile
- [ ] Test visual en device/emulador.

**Commit:** `feat(mobile): entrada manual peso MASS en ProductSheet`

---

## Resumen de archivos por tarea

| Tarea | Archivos | Commit |
|-------|----------|--------|
| 1 | `src/lib/scale.ts` (nuevo) | `feat(desktop): helper scale.ts...` |
| 2 | `src/components/ProductSheet.tsx` | `feat(desktop): ProductSheet modo MASS...` |
| 3 | `src/screens/PosTerminalScreen.tsx` | `feat(desktop): PosTerminalScreen detecta báscula...` |
| 4 | `src/components/ProductSheet.tsx` | `feat(desktop): lectura peso báscula...` |
| 5 | `src/components/CartSheet.tsx` | `feat(desktop): CartSheet muestra peso...` |
| 6 | `src/components/ProductSheet.tsx` | `feat(desktop): validaciones stock...` |
| 7 | `src/components/ProductSheet.tsx` | `feat(desktop): modo CAJ...` |
| 8 | `pos-mobile/...` | `feat(mobile): entrada manual peso...` |

---

## Checklist global de validación final

- [ ] Venta MASS sin báscula: input manual 0.250 kg → carrito ok → venta confirmada.
- [ ] Venta MASS con báscula: leer → override → carrito ok.
- [ ] Stock respeta kg (no vender más de lo disponible).
- [ ] Precisión 3 decimales (gramos) en todo el flujo.
- [ ] CAJ funciona si hay productos.
- [ ] pos-mobile portado.
- [ ] `npm run tauri dev` + `npm run build` sin errores.
- [ ] `npx tsc --noEmit` limpio en ambos proyectos.