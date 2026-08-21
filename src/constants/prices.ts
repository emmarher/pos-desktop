/**
 * constants/prices.ts — Precios por tipo de un producto (RF-CA-004).
 *
 * Devuelve [{ priceType, price }, ...] combinando `product.prices` con la
 * lista real de GET /price-types. Si el producto no trae precios, cae al
 * precio base (Público). Portado de pos-mobile.
 */
import {PriceType, Product, ProductPrice} from '../models';

/** Precio disponible de un producto para un tipo de precio. */
export interface ProductPriceOption {
  priceType: PriceType;
  price: number;
}

/**
 * Precios disponibles de un producto. `priceTypes` (opcional) es la lista
 * real del servidor; si no se pasa o no hay coincidencias, usa el precio
 * base del producto con un tipo "Público" derivado.
 */
export function getProductPrices(
  product: Product,
  priceTypes?: PriceType[],
): ProductPriceOption[] {
  const types = priceTypes && priceTypes.length > 0 ? priceTypes : undefined;

  if (product.prices && product.prices.length > 0) {
    return product.prices.map((pp: ProductPrice) => {
      const priceType =
        types?.find(t => t.id === pp.price_type_id) ??
        // Fallback: tipo derivado del id enviado por el servidor
        ({
          id: pp.price_type_id,
          tenant_id: product.tenant_id,
          code: pp.price_type_id,
          name: 'Precio',
          is_default: false,
          display_order: 0,
        } as PriceType);
      return {priceType, price: pp.price};
    });
  }

  // Sin precios por tipo → precio base como Público
  const publicType: PriceType =
    types?.find(t => t.code === 'RETAIL') ?? types?.[0] ?? {
      id: 'retail',
      tenant_id: product.tenant_id,
      code: 'RETAIL',
      name: 'Público',
      is_default: true,
      display_order: 0,
    };
  return [{priceType: publicType, price: product.price}];
}