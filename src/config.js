// Edit these in one place.
export const SITE = {
  name: 'VOZ LINGUA',
  whatsapp: '919289731089', // country code + number, no "+" (taken from your original site)
};
export const waLink = (text = 'Hello! I would like to know more about VOZ LINGUA.') =>
  `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(text)}`;
