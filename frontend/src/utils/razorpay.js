// Loads Razorpay's hosted checkout script on demand (only when the buyer pays online).
let loading = null;
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () =>
      window.Razorpay
        ? resolve(window.Razorpay)
        : reject(new Error('Razorpay failed to initialise'));
    s.onerror = () => {
      loading = null;
      reject(new Error('Could not load the payment window. Check your connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}
