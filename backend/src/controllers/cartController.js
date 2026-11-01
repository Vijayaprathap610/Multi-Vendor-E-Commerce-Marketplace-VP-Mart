import * as cart from '../services/cartService.js';

export const get = async (req, res) => res.json(await cart.getCart(req.user._id));

export async function add(req, res) {
  const { listingId, quantity } = req.valid.body;
  await cart.addItem(req.user._id, listingId, quantity);
  res.status(201).json(await cart.getCart(req.user._id));
}
export async function setQty(req, res) {
  await cart.setQuantity(req.user._id, req.valid.params.listingId, req.valid.body.quantity);
  res.json(await cart.getCart(req.user._id));
}
export async function remove(req, res) {
  await cart.removeItem(req.user._id, req.valid.params.listingId);
  res.json(await cart.getCart(req.user._id));
}
export async function clear(req, res) {
  await cart.clearCart(req.user._id);
  res.json(await cart.getCart(req.user._id));
}
// Prices an arbitrary list of items (used by Buy Now) with the same server-side rules as the cart.
export const quote = async (req, res) => {
  const { _couponDoc, ...priced } = await cart.priceItems(req.valid.body.items, {
    couponCode: req.valid.body.couponCode,
    buyerId: req.user._id,
  });
  res.json(priced);
};
