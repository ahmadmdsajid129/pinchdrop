// The PinchDrop website's settings. Paste your Dodo Payments checkout links here (Dodo dashboard →
// Products → a product → Share / payment link). Empty = that button stays disabled.
// In Dodo, set each product's return / redirect URL to:
//   https://ahmadmdsajid129.github.io/pinchdrop/thanks.html
window.PINCHDROP = {
  checkout: {
    lifetime: '',
    yearly: '',
    monthly: '',
  },
  prices: { lifetime: '$29', yearly: '$19 / year', monthly: '$2.99 / month' },
  // Where people download the apps (GitHub Releases of this repo).
  windows: 'https://github.com/ahmadmdsajid129/pinchdrop/releases/latest',
  android: 'https://github.com/ahmadmdsajid129/pinchdrop/releases/latest/download/PinchDrop.apk',
  // Google Play listing, once it's live ('' hides the button).
  play: '',
  // A support email for buyers, like 'mailto:support@example.com' ('' hides the link).
  support: '',
};
