export const INSTITUTE = {
  name: "AI Institute Satana",
  tagline: "Learn. Grow. Earn.",
  phones: ["8390576960", "9765961072", "7249633654"],
  email: "contact@aiinstitutesatana.in",
  address: "Satana, Nashik, Maharashtra, India",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=Satana%2C+Nashik%2C+Maharashtra%2C+India",
};

export function telHref(phone: string) {
  return `tel:+91${phone.replace(/\D/g, "")}`;
}
