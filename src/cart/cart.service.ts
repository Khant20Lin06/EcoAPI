import { Injectable } from '@nestjs/common';

@Injectable()
export class CartService {
  getCart(userId: string) {
    void userId;
    return { id: 'cart', items: [] };
  }

  addItem(userId: string, payload: { variantId: string; qty: number }) {
    void userId;
    return { ok: true, action: 'cart.add', payload };
  }

  updateItem(userId: string, id: string, payload: { qty: number }) {
    void userId;
    return { ok: true, action: 'cart.update', id, payload };
  }

  removeItem(userId: string, id: string) {
    void userId;
    return { ok: true, action: 'cart.remove', id };
  }
}
