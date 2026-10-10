export function siteOf(address) {
  const url = new URL(address);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Enter a website address starting with https://.");
  return url.hostname.replace(/^www\./, "");
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z\d.-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
}

export function connectionMention(connection) {
  return slug(connection.name) || slug(connection.site);
}
