// Test Data Products API
const TENANT_URL = process.env.QLIK_TENANT_URL || "";
const API_KEY = process.env.QLIK_API_KEY || "";

async function fetchAPI(endpoint: string) {
  const prefix = endpoint.startsWith("/data-governance") ? "/api" : "/api/v1";
  const url = `${TENANT_URL}${prefix}${endpoint}`;
  console.log(`Fetching: ${url}`);

  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    console.log(`Error ${res.status}: ${res.statusText}`);
    const text = await res.text();
    console.log(`Response: ${text.slice(0, 500)}`);
    return null;
  }

  return res.json();
}

async function test() {
  console.log("=== Testing Data Products API ===\n");

  // 1. Get items with resourceType=dataproduct
  console.log("1. Items API (dataproduct):");
  const items = await fetchAPI("/items?resourceType=dataproduct&limit=5");
  if (items?.data) {
    console.log(`Found ${items.data.length} items`);
    if (items.data[0]) {
      console.log("First item keys:", Object.keys(items.data[0]));
      console.log("First item:", JSON.stringify(items.data[0], null, 2));
    }
  }

  // 2. Get data product details from data-governance API
  if (items?.data?.[0]) {
    const productId = items.data[0].resourceId || items.data[0].id;
    console.log(`\n2. Data Governance API for product ${productId}:`);
    const product = await fetchAPI(`/data-governance/data-products/${productId}`);
    if (product) {
      console.log("Product keys:", Object.keys(product));
      console.log("datasetIds:", product.datasetIds?.length || 0);
      console.log("spaceId:", product.spaceId);
      console.log("activated:", product.activated);
      console.log("Full product:", JSON.stringify(product, null, 2).slice(0, 2000));
    }

    // 3. Get space details
    if (product?.spaceId) {
      console.log(`\n3. Space API for ${product.spaceId}:`);
      const space = await fetchAPI(`/spaces/${product.spaceId}`);
      if (space) {
        console.log("Space name:", space.name);
        console.log("Space type:", space.type);
      }
    }
  }
}

test().catch(console.error);
