'use strict';
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  Settings,
  Printer,
  QrCode,
  CheckCircle2,
  RefreshCw,
  Search,
  ArrowRight,
  Database,
  Store,
  User,
  Phone,
  X,
  CreditCard,
  Banknote,
  Receipt,
  AlertTriangle,
} from 'lucide-react';
import { INITIAL_PRODUCTS, Product } from '@/lib/products';
import { CartItem, BillOrder, pushVoucherToTally } from '@/lib/tally';
import {
  getActiveTallyConfig,
  updateActiveTallyConfig,
  isSupabaseConfigured,
  TallyConfig,
} from '@/lib/supabase';
import confetti from 'canvas-confetti';

export default function SweetPOSPage() {
  const [products] = useState<Product[]>(INITIAL_PRODUCTS);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeProductForWeight, setActiveProductForWeight] = useState<Product | null>(null);

  // Settings & Tally State
  const [tallyConfig, setTallyConfig] = useState<TallyConfig>({
    tally_url: '',
    company_name: 'Spj',
    shop_name: 'Mithai Mahal Sweets',
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newTallyUrl, setNewTallyUrl] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [tallySyncStatus, setTallySyncStatus] = useState<string | null>(null);

  // Checkout Modal State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Card' | 'Udhaar'>('Cash');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);
  const [lastCompletedBill, setLastCompletedBill] = useState<BillOrder | null>(null);

  // Load config on mount
  useEffect(() => {
    getActiveTallyConfig().then((cfg) => {
      setTallyConfig(cfg);
      setNewTallyUrl(cfg.tally_url);
      setNewCompanyName(cfg.company_name);
    });
  }, []);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.hindi_name.includes(searchQuery);
      return matchesCat && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Cart Calculations
  const { subtotal, cgst, sgst, grandTotal } = useMemo(() => {
    let sub = 0;
    let tax = 0;
    cart.forEach((item) => {
      sub += item.total_price;
      if (item.tax_rate > 0) {
        tax += (item.total_price * item.tax_rate) / 100;
      }
    });
    const halfTax = tax / 2;
    return {
      subtotal: sub,
      cgst: halfTax,
      sgst: halfTax,
      grandTotal: Math.round(sub + tax),
    };
  }, [cart]);

  // Add Item to Cart
  const addToCart = (product: Product, quantity: number) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (i) => i.id === product.id && i.quantity === quantity
      );
      if (existingIndex > -1) {
        const updated = [...prev];
        const item = updated[existingIndex];
        const newQty = item.quantity + quantity;
        updated[existingIndex] = {
          ...item,
          quantity: newQty,
          total_price: Math.round(newQty * product.price_per_unit),
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            id: product.id,
            name: product.name,
            hindi_name: product.hindi_name,
            unit: product.unit,
            quantity: quantity,
            price_per_unit: product.price_per_unit,
            total_price: Math.round(quantity * product.price_per_unit),
            tax_rate: product.tax_rate,
          },
        ];
      }
    });
    setActiveProductForWeight(null);
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const clearCart = () => setCart([]);

  // Handle Order Checkout & Tally Sync
  const handleCompleteOrder = async () => {
    if (cart.length === 0) return;
    setIsProcessingOrder(true);
    setTallySyncStatus('Pushing to Tally...');

    const billNumber = `SW-${Date.now().toString().slice(-6)}`;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');

    const order: BillOrder = {
      bill_number: billNumber,
      date: `${y}${m}${d}`,
      customer_name: customerName.trim() || undefined,
      customer_phone: customerPhone.trim() || undefined,
      payment_mode: paymentMode,
      items: cart,
      subtotal,
      cgst,
      sgst,
      grand_total: grandTotal,
      company_name: tallyConfig.company_name,
    };

    try {
      // Push directly to TallyPrime via Bridge
      const syncResult = await pushVoucherToTally(tallyConfig.tally_url, order);
      if (syncResult.success) {
        setTallySyncStatus('✓ Synced to TallyPrime');
      } else {
        setTallySyncStatus(`⚠️ Tally: ${syncResult.message}`);
      }
    } catch (e: any) {
      setTallySyncStatus(`⚠️ Sync error: ${e.message}`);
    }

    confetti({ particleCount: 75, spread: 60, origin: { y: 0.7 } });
    setLastCompletedBill(order);
    setIsProcessingOrder(false);
    clearCart();
    setCustomerName('');
    setCustomerPhone('');
  };

  // Save Settings
  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    await updateActiveTallyConfig(newTallyUrl, newCompanyName);
    setTallyConfig((prev) => ({
      ...prev,
      tally_url: newTallyUrl,
      company_name: newCompanyName,
    }));
    setIsSavingSettings(false);
    setIsSettingsOpen(false);
  };

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-50 border-x border-slate-200 overflow-hidden shadow-2xl relative">
      {/* 1. Header Bar */}
      <header className="bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 text-white px-4 py-3 shrink-0 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-2">
          <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-black text-lg tracking-tight leading-none">
              {tallyConfig.shop_name}
            </h1>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-medium text-amber-100 uppercase tracking-wider">
                Tally: {tallyConfig.company_name}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white border border-white/20"
          title="Tally & Supabase Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </header>

      {/* 2. Search & Category Tabs */}
      <div className="bg-white px-3 pt-2.5 pb-2 border-b border-slate-200 shrink-0 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search mithai, samosa, paneer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-100 rounded-xl pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 border border-slate-200"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex space-x-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {[
            { id: 'all', label: 'All Items', emoji: '✨' },
            { id: 'mithai', label: 'Mithai', emoji: '🍬' },
            { id: 'namkeen', label: 'Snacks', emoji: '🥨' },
            { id: 'dairy', label: 'Dairy', emoji: '🥛' },
            { id: 'beverages', label: 'Drinks', emoji: '🥤' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center space-x-1 ${
                selectedCategory === cat.id
                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-300'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Product Grid */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          {filteredProducts.map((p) => (
            <div
              key={p.id}
              onClick={() => {
                if (p.unit === 'kg') {
                  setActiveProductForWeight(p);
                } else {
                  addToCart(p, 1);
                }
              }}
              className="bg-white rounded-2xl p-3 border border-slate-200/80 hover:border-amber-400 hover:shadow-md transition-all active:scale-98 flex flex-col justify-between cursor-pointer group"
            >
              <div>
                <div className="flex items-start justify-between">
                  <span className="text-2xl p-1 rounded-xl bg-amber-50 border border-amber-100 group-hover:scale-110 transition-transform">
                    {p.emoji}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    /{p.unit}
                  </span>
                </div>
                <h3 className="font-bold text-sm text-slate-900 mt-2 line-clamp-1">
                  {p.name}
                </h3>
                <p className="text-xs text-amber-700 font-medium">{p.hindi_name}</p>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="font-black text-slate-900 text-base">
                  ₹{p.price_per_unit}
                </span>
                <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg flex items-center space-x-0.5">
                  <Plus className="w-3 h-3 stroke-[3]" />
                  <span>Add</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Bottom Sticky Cart Bar */}
      <div className="bg-white border-t border-slate-200 p-3 shrink-0 shadow-lg">
        {cart.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 px-1">
              <span>
                {cart.length} item{cart.length > 1 ? 's' : ''} in cart
              </span>
              <button
                onClick={clearCart}
                className="text-red-500 hover:text-red-600 flex items-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>

            {/* Quick mini-cart list */}
            <div className="max-h-24 overflow-y-auto space-y-1 pr-1 text-xs">
              {cart.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100"
                >
                  <div className="flex items-center space-x-1.5">
                    <span className="font-bold text-slate-800">{item.name}</span>
                    <span className="text-slate-400">
                      (
                      {item.unit === 'kg' && item.quantity < 1
                        ? `${Math.round(item.quantity * 1000)}g`
                        : `${item.quantity} ${item.unit}`}
                      )
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-black text-slate-900">₹{item.total_price}</span>
                    <button
                      onClick={() => removeFromCart(idx)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setIsCheckoutOpen(true)}
              className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-between shadow-lg shadow-emerald-200 active:scale-98 transition-all"
            >
              <div className="text-left">
                <div className="text-[10px] text-emerald-100 uppercase tracking-wider font-semibold">
                  Total Bill
                </div>
                <div className="text-xl font-black leading-tight">₹{grandTotal}</div>
              </div>
              <div className="flex items-center space-x-1.5 bg-white/20 px-3 py-1.5 rounded-lg backdrop-blur-sm">
                <span>Charge & Sync</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          </div>
        ) : (
          <div className="py-2 text-center text-slate-400 text-xs flex items-center justify-center space-x-2">
            <ShoppingBag className="w-4 h-4" />
            <span>Tap any sweet or snack above to add to cart</span>
          </div>
        )}
      </div>

      {/* MODAL 1: Weight Selector Sheet (for Kg items) */}
      {activeProductForWeight && (
        <div className="absolute inset-0 bg-black/60 z-50 flex flex-col justify-end backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl p-5 border-t border-slate-200 space-y-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-lg text-slate-900 flex items-center space-x-2">
                  <span>{activeProductForWeight.emoji}</span>
                  <span>{activeProductForWeight.name}</span>
                </h3>
                <p className="text-xs text-amber-700 font-semibold">
                  {activeProductForWeight.hindi_name} • ₹{activeProductForWeight.price_per_unit}/kg
                </p>
              </div>
              <button
                onClick={() => setActiveProductForWeight(null)}
                className="p-1 rounded-full bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Select Quantity / Weight:
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '100g', qty: 0.1 },
                { label: '250g', qty: 0.25 },
                { label: '500g', qty: 0.5 },
                { label: '1 Kg', qty: 1.0 },
                { label: '1.5 Kg', qty: 1.5 },
                { label: '2 Kg', qty: 2.0 },
                { label: '2.5 Kg', qty: 2.5 },
                { label: '5 Kg', qty: 5.0 },
              ].map((w) => {
                const cost = Math.round(w.qty * activeProductForWeight.price_per_unit);
                return (
                  <button
                    key={w.label}
                    onClick={() => addToCart(activeProductForWeight, w.qty)}
                    className="p-2.5 rounded-xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50 text-center active:scale-95 transition-all group"
                  >
                    <div className="font-black text-sm text-slate-800 group-hover:text-amber-800">
                      {w.label}
                    </div>
                    <div className="text-[11px] font-bold text-amber-600 mt-0.5">₹{cost}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Checkout & Payment Modal */}
      {isCheckoutOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex flex-col justify-end backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl p-5 border-t border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="font-black text-lg text-slate-900">Complete Billing</h3>
                <p className="text-xs text-slate-500">Collect payment & push to Tally</p>
              </div>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="p-1 rounded-full bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bill Summary */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal ({cart.length} items):</span>
                <span className="font-bold">₹{subtotal}</span>
              </div>
              {(cgst > 0 || sgst > 0) && (
                <>
                  <div className="flex justify-between text-slate-500">
                    <span>CGST (2.5%):</span>
                    <span>₹{cgst.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>SGST (2.5%):</span>
                    <span>₹{sgst.toFixed(2)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-slate-900 font-black text-base pt-1 border-t border-slate-200">
                <span>Grand Total:</span>
                <span className="text-emerald-600">₹{grandTotal}</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Payment Mode:
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'Cash', icon: Banknote },
                  { id: 'UPI', icon: QrCode },
                  { id: 'Card', icon: CreditCard },
                  { id: 'Udhaar', icon: Receipt },
                ].map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setPaymentMode(m.id as any)}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all ${
                        paymentMode === m.id
                          ? 'border-amber-500 bg-amber-50 text-amber-900 font-black shadow-xs'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-[11px] font-semibold">{m.id}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* UPI QR Display if UPI selected */}
            {paymentMode === 'UPI' && (
              <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 text-center space-y-2">
                <div className="text-xs font-bold text-amber-900">
                  Scan to Pay: ₹{grandTotal}
                </div>
                <div className="bg-white p-3 rounded-xl inline-block shadow-xs border border-amber-200">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=upi://pay?pa=rishabh@upi&pn=Mithai%20Mahal&am=${grandTotal}&cu=INR`}
                    alt="UPI QR"
                    className="w-32 h-32 mx-auto"
                  />
                </div>
                <div className="text-[11px] text-amber-700 font-medium">
                  Any UPI App: GPay, PhonePe, Paytm
                </div>
              </div>
            )}

            {/* Optional Customer Details */}
            <div className="space-y-2 pt-1">
              <div className="flex space-x-2">
                <div className="flex-1 relative">
                  <User className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Customer Name (Optional)"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-slate-100 rounded-xl pl-8 pr-3 py-2 text-xs focus:ring-1 focus:ring-amber-500 outline-none border border-slate-200"
                  />
                </div>
                <div className="flex-1 relative">
                  <Phone className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="tel"
                    placeholder="Mobile (For SMS bill)"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full bg-slate-100 rounded-xl pl-8 pr-3 py-2 text-xs focus:ring-1 focus:ring-amber-500 outline-none border border-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* Tally Sync Indicator */}
            <div className="text-[11px] bg-slate-100 p-2 rounded-xl flex items-center justify-between text-slate-600">
              <div className="flex items-center space-x-1.5">
                <Database className="w-3.5 h-3.5 text-amber-600" />
                <span>Auto Push to Tally:</span>
              </div>
              <span className="font-bold text-slate-800">{tallyConfig.company_name}</span>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleCompleteOrder}
              disabled={isProcessingOrder}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 px-4 rounded-xl flex items-center justify-center space-x-2 shadow-lg shadow-emerald-200 active:scale-98 transition-all disabled:opacity-50"
            >
              {isProcessingOrder ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Syncing with Tally...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Confirm & Save Bill (₹{grandTotal})</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* MODAL 3: Settings & Dynamic Tally URL Sheet */}
      {isSettingsOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex flex-col justify-end backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl p-5 border-t border-slate-200 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-lg text-slate-900">App & Tally Settings</h3>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 rounded-full bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Supabase Status Indicator */}
            <div
              className={`p-3 rounded-xl border text-xs flex items-center space-x-2 ${
                isSupabaseConfigured
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <Database className="w-4 h-4 shrink-0" />
              <div>
                <span className="font-bold">
                  {isSupabaseConfigured
                    ? 'Supabase Cloud Sync Active'
                    : 'Local Mode (Supabase keys not in ENV)'}
                </span>
                <p className="text-[11px] opacity-80 mt-0.5">
                  Changing Tally URL below will automatically update Supabase and all phones!
                </p>
              </div>
            </div>

            {/* Tally Tunnel URL Field */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Cloudflare / Tally Tunnel URL:
              </label>
              <input
                type="text"
                value={newTallyUrl}
                onChange={(e) => setNewTallyUrl(e.target.value)}
                placeholder="https://...trycloudflare.com/?key=..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-amber-500 outline-none"
              />
              <p className="text-[10px] text-slate-400">
                Whenever Cloudflare restarts, just paste the new URL here once.
              </p>
            </div>

            {/* Target Tally Company */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Tally Company Name:
              </label>
              <input
                type="text"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                placeholder="Spj"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500 outline-none font-bold"
              />
            </div>

            <button
              onClick={handleSaveSettings}
              disabled={isSavingSettings}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl active:scale-98 transition-all flex items-center justify-center space-x-2"
            >
              {isSavingSettings ? (
                <span>Saving to Supabase...</span>
              ) : (
                <span>Save Configuration</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* MODAL 4: Thermal Receipt & Print Dialog */}
      {lastCompletedBill && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm space-y-4 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="text-center space-y-1 border-b border-dashed border-slate-300 pb-3">
              <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="font-black text-slate-900 text-base uppercase">
                {tallyConfig.shop_name}
              </h2>
              <p className="text-[11px] text-slate-500 font-mono">
                Bill #{lastCompletedBill.bill_number} • {lastCompletedBill.payment_mode}
              </p>
              {tallySyncStatus && (
                <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 py-0.5 px-2 rounded-full inline-block">
                  {tallySyncStatus}
                </div>
              )}
            </div>

            {/* Receipt Items */}
            <div className="space-y-1.5 text-xs max-h-48 overflow-y-auto font-mono">
              {lastCompletedBill.items.map((it, i) => (
                <div key={i} className="flex justify-between text-slate-700">
                  <span>
                    {it.name}{' '}
                    <span className="text-[10px] text-slate-400">
                      x
                      {it.unit === 'kg' && it.quantity < 1
                        ? `${Math.round(it.quantity * 1000)}g`
                        : `${it.quantity}${it.unit}`}
                    </span>
                  </span>
                  <span className="font-bold">₹{it.total_price}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 text-xs font-mono">
              <div className="flex justify-between font-black text-sm text-slate-900">
                <span>TOTAL PAID:</span>
                <span className="text-emerald-600">₹{lastCompletedBill.grand_total}</span>
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => window.print()}
                className="flex-1 bg-slate-900 text-white font-bold py-2.5 rounded-xl flex items-center justify-center space-x-1.5 text-xs active:scale-95 transition-all"
              >
                <Printer className="w-4 h-4" />
                <span>Print Bill</span>
              </button>
              <button
                onClick={() => setLastCompletedBill(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-xl text-xs active:scale-95 transition-all"
              >
                Next Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
