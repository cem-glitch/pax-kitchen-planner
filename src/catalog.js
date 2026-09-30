export const SHOP_URL = "https://paxkok.myshopify.com";

export const FALLBACK_PRODUCTS = [
  {
    id: 10057540698449,
    title: "PizzaMaster PM351ED-1, 1×2 pizzor",
    vendor: "PIZZAMASTER",
    product_type: "Pizzaugn",
    price: "22472.00",
    image: "https://cdn.shopify.com/s/files/1/0622/8983/8277/files/pm-351ed-1-pizzaugn-kompakt-stenugn-pizzamaster-1-deck-digital-bakepartner-600x600.jpg?v=1743665156",
    body_html: "",
  },
  {
    id: 10998857531729,
    title: "PizzaMaster PM 911ED Pizzaugn – PM 900 Series",
    vendor: "PIZZAMASTER",
    product_type: "Pizzaugn",
    price: "55394.00",
    image: "https://cdn.shopify.com/s/files/1/0622/8983/8277/files/IMG_5052.jpg?v=1785851833",
    body_html: "",
  },
  {
    id: 10998784557393,
    title: "PizzaMaster PM 841ED Pizzaugn – PM 800 Series",
    vendor: "PIZZAMASTER",
    product_type: "Pizzaugn",
    price: "78043.00",
    image: "https://cdn.shopify.com/s/files/1/0622/8983/8277/files/IMG_5047.jpg?v=1785849299",
    body_html: "",
  },
];

export function htmlToText(html = "") {
  return String(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&times;/g, "×")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function fallbackDimensions(product) {
  const text = ((product.title || "") + " " + (product.product_type || "")).toLowerCase();

  if (text.includes("pizzaugn") || text.includes("ugn")) return { w: 1000, d: 1000, h: 900 };
  if (text.includes("kyl") || text.includes("frys")) return { w: 600, d: 700, h: 1900 };
  if (text.includes("diskbänk")) return { w: 1200, d: 700, h: 900 };
  if (text.includes("arbetsbänk") || text.includes("bänk")) return { w: 1200, d: 700, h: 900 };
  if (text.includes("diskmaskin")) return { w: 600, d: 650, h: 850 };
  if (text.includes("fritös")) return { w: 400, d: 700, h: 900 };
  if (text.includes("grill")) return { w: 600, d: 700, h: 900 };
  if (text.includes("is")) return { w: 500, d: 600, h: 850 };
  if (text.includes("vagn")) return { w: 500, d: 700, h: 1600 };
  return { w: 600, d: 700, h: 900 };
}

export function getProductDimensions(product) {
  const text = htmlToText(product.body_html || product.description || "");

  const field = (labels) => {
    const re = new RegExp("(?:" + labels + ")\\s*[:=\\-]?\\s*(\\d{2,4})\\s*(?:mm)?", "i");
    const match = text.match(re);
    return match ? Number(match[1]) : null;
  };

  const w = field("bredd|width");
  const d = field("djup|depth");
  const h = field("höjd|hojd|height");

  if (w && d) return { w, d, h: h || 900, estimated: !h };

  const triple = text.match(/(?:mått|dimensioner|dimensions?)?[^0-9]{0,24}(\d{2,4})\s*[x×]\s*(\d{2,4})\s*[x×]\s*(\d{2,4})\s*(?:mm)?/i);
  if (triple) {
    return { w: Number(triple[1]), d: Number(triple[2]), h: Number(triple[3]), estimated: false };
  }

  return { ...fallbackDimensions(product), estimated: true };
}

export function normalizeProduct(product) {
  const variant = product.variants?.[0] || {};
  const dimensions = getProductDimensions(product);

  return {
    id: String(product.id),
    title: product.title || "Produkt",
    vendor: product.vendor || "",
    type: product.product_type || "Övrigt",
    price: Number(variant.price || product.price || 0),
    image: product.images?.[0]?.src || product.image?.src || product.image || null,
    body_html: product.body_html || "",
    ...dimensions,
  };
}

export async function loadCatalog() {
  const pages = await Promise.all(
    [1, 2, 3].map(async (page) => {
      const response = await fetch(SHOP_URL + "/products.json?limit=250&page=" + page);
      if (!response.ok) throw new Error("Katalog HTTP " + response.status);
      const json = await response.json();
      return Array.isArray(json.products) ? json.products : [];
    })
  );

  const all = pages.flat();
  const unique = Array.from(new Map(all.map((product) => [String(product.id), product])).values());
  if (!unique.length) throw new Error("Tom produktkatalog");
  return unique.map(normalizeProduct);
}

export function getFallbackCatalog() {
  return FALLBACK_PRODUCTS.map(normalizeProduct);
}

export function formatSEK(value) {
  const number = Math.round(Number(value || 0));
  try {
    return number.toLocaleString("sv-SE") + " kr";
  } catch {
    return number + " kr";
  }
}
