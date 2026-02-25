const TENANT_URL = "https://bitechnology.de.qlikcloud.com";
const API_KEY = "eyJhbGciOiJFUzM4NCIsImtpZCI6IjU1ZWIxNWI0LWU2ZmUtNDdhOS04OGFiLTMyZDM4YjAxZjIyMiIsInR5cCI6IkpXVCJ9.eyJzdWJUeXBlIjoidXNlciIsInRlbmFudElkIjoiWWlyLVZsR3QwaDg0cThEX0lFd0R0ckVta25jMHktVUkiLCJqdGkiOiI1NWViMTViNC1lNmZlLTQ3YTktODhhYi0zMmQzOGIwMWYyMjIiLCJhdWQiOiJxbGlrLmFwaSIsImlzcyI6InFsaWsuYXBpL2FwaS1rZXlzIiwic3ViIjoiNjY5OGY3OTU2NWFlMDQ5MGFiMmFmNjY5In0.21kKXDZFKHWvqcCEjFM7Lyd45jZPjJ7oIL0yZ6fJ0b7nCmmecapc0eIJPYFX7ulCPZ-UgkBJJR9KJca1W1kYnyFxUlQjTPIgiK5LdjIdr88h_tmZl0hTtOp0hWI664TB";

async function fetchAPI(path: string) {
  const prefix = path.startsWith("/data-governance") ? "/api" : "/api/v1";
  const url = TENANT_URL + prefix + path;
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + API_KEY }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(res.status + ": " + text.slice(0, 200));
  }
  return res.json();
}

async function test() {
  console.log("=== Data Product Detail Test ===\n");

  // Get list first
  const items = await fetchAPI("/items?resourceType=dataproduct&limit=1");
  const resourceId = items.data?.[0]?.resourceId;

  if (!resourceId) {
    console.log("No data products found");
    return;
  }

  console.log("Product resourceId:", resourceId);

  // Get detail with governance API
  const detail = await fetchAPI("/data-governance/data-products/" + resourceId);

  console.log("\n=== Full Detail ===\n");
  console.log(JSON.stringify(detail, null, 2));
}

test().catch(console.error);
