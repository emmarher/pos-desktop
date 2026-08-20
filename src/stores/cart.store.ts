/**
 * cart.store.ts — Carrito en memoria del cajero (RF-VE-001).
 *
 * Portado verbatim desde pos-mobil. El carrito SOLO vive en memoria;
 * nunca se persiste ni se envía hasta que el cajero confirma la venta.
 */
import {create} from 'zustand';
import {
  CartItem,
  CreateSalePayload,
  Customer,
  PriceType,
  SalePayment,
} from '../models';

export interface CartTotals {
  subtotal: number;
  discount: number;
  total: number;
  itemCount: number;
}

export interface CartState {
  items: CartItem[];
  priceType: PriceType | null;
  customer: Customer | null;
  payments: SalePayment[];
  change: number;

  setPriceType: (priceType: PriceType) => void;
  addItem: (item: CartItem) => void;
  updateItem: (key: string, patch: Partial<CartItem>) => void;
  removeItem: (key: string) => void;
  setCustomer: (customer: Customer | null) => void;
  addPayment: (payment: SalePayment) => void;
  removePayment: (index: number) => void;
  computeChange: (cashReceived: number) => void;
  clearCart: () => void;
  buildSalePayload: () => CreateSalePayload;
  totals: () => CartTotals;
  paidAmount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  priceType: null,
  customer: null,
  payments: [],
  change: 0,

  setPriceType: priceType => set({priceType}),

  addItem: item =>
    set(state =>
      item.product.stock > 0
        ? {items: [...state.items, item]}
        : state,
    ),

  updateItem: (key, patch) =>
    set(state => ({
      items: state.items.map(it =>
        it.key === key ? {...it, ...patch} : it,
      ),
    })),

  removeItem: key =>
    set(state => ({items: state.items.filter(it => it.key !== key)})),

  setCustomer: customer => set({customer}),

  addPayment: payment =>
    set(state => ({payments: [...state.payments, payment]})),

  removePayment: index =>
    set(state => ({
      payments: state.payments.filter((_, i) => i !== index),
    })),

  computeChange: cashReceived => {
    const {totals, paidAmount} = get();
    const cashPayments = get()
      .payments.filter(p => p.method === 'CASH')
      .reduce((sum, p) => sum + p.amount, 0);
    const remaining = totals().total - paidAmount() + cashPayments;
    set({change: Math.max(0, cashReceived - remaining)});
  },

  clearCart: () =>
    set({items: [], priceType: null, customer: null, payments: [], change: 0}),

  buildSalePayload: () => {
    const {items, customer, payments, totals} = get();
    return {
      customer_id: customer?.id,
      items: items.map(it => ({
        product_id: it.product.id,
        quantity: it.quantity,
        alternate_quantity: it.weightKg,
        unit_price: it.unitPrice,
        discount: it.discount,
        subtotal: it.subtotal,
        base_quantity: it.baseQuantity,
        price_type_id: it.priceType.id,
      })),
      payments: payments.map(p => ({
        method: p.method,
        amount: p.amount,
        reference_code: p.reference_code,
      })),
      subtotal: totals().subtotal,
      total_discount: totals().discount,
      total: totals().total,
    };
  },

  totals: () => {
    const {items} = get();
    const subtotal = items.reduce((sum, it) => sum + it.subtotal, 0);
    const discount = items.reduce((sum, it) => sum + it.discount, 0);
    return {
      subtotal,
      discount,
      total: Math.max(0, subtotal - discount),
      itemCount: items.length,
    };
  },

  paidAmount: () =>
    get()
      .payments.filter(p => p.method !== 'CREDIT')
      .reduce((sum, p) => sum + p.amount, 0),
}));